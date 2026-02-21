// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

/**
 * TestShop — Cabo Attribution Middleware (PROD)
 *
 * Flow:
 * - URL'de token & lid varsa:
 *    1) Cabo verify çağrısı (server-side / edge)
 *    2) verify ok => signed attribution cookie (cabo_attrib) set
 *    3) URL'den token/lid temizlenir (302 redirect)
 *
 * Debug:
 * - cabo_debug (httpOnly=false) -> tarayıcıda görünür (cookie gerçekten set ediliyor mu diye)
 */

const REF_COOKIE = "cabo_attrib";
const DEBUG_COOKIE = "cabo_debug";

const TTL_DAYS = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
const ATTRIB_TTL_SEC = Number(process.env.CABO_ATTRIB_TTL_SEC || 36000);

const VERIFY_URL = String(process.env.CABO_VERIFY_URL || "").trim(); // https://cabo.../api/testshop_verify
const HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim();
const SCOPE_ENV = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").trim().toLowerCase();

function b64urlUtf8(input: string) {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacHex(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isLikelyValidToken(token: string) {
  const t = (token || "").trim();
  return t.length >= 16 && t.length <= 256;
}

function parsePositiveInt(v: string | null) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function safeSlugFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("products");
  if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]).trim();
  return null;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  const token = (url.searchParams.get("token") || "").trim();
  const lid = parsePositiveInt(url.searchParams.get("lid"));

  // token/lid yoksa normal devam
  if (!token || !lid) return NextResponse.next();

  // kaba validasyon
  if (!isLikelyValidToken(token)) return NextResponse.next();

  // env yoksa bu middleware attribution yapamaz -> URL temizlemeyelim (debug için daha iyi)
  if (!VERIFY_URL || !HMAC_SECRET) return NextResponse.next();

  const slug = safeSlugFromPath(url.pathname);

  // --- 1) Cabo verify (server-side)
  let verifyOk = false;
  let verifiedSlug: string | null = null;

  try {
    const r = await fetch(`${VERIFY_URL.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-testshop-origin": url.origin,
        "x-testshop-ua": req.headers.get("user-agent") || "",
        "x-testshop-referer": req.headers.get("referer") || "",
      },
      body: JSON.stringify({ token, lid, slug }),
      cache: "no-store",
    });

    if (r.ok) {
      const data = (await r.json().catch(() => null)) as unknown;
      const d = data as any;
      if (d && d.ok === true) {
        verifyOk = true;
        verifiedSlug = typeof d.slug === "string" ? d.slug : null;
      }
    }
  } catch {
    verifyOk = false;
  }

  // token/lid'i URL'den her durumda temizleyelim (senin istediğin davranış buydu)
  url.searchParams.delete("token");
  url.searchParams.delete("lid");

  // verify fail => sadece temiz URL'ye dön
  if (!verifyOk) {
    const res = NextResponse.redirect(url.toString(), 302);
    res.headers.set("Cache-Control", "no-store");
    // debug: verify fail bile görelim
    res.cookies.set(DEBUG_COOKIE, `fail_${Date.now()}`, {
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 5,
    });
    return res;
  }

  // --- 2) attribution cookie payload
  const now = Math.floor(Date.now() / 1000);
  const scope = SCOPE_ENV === "landing" ? "landing" : "sitewide";

  const payload = {
    v: 1,
    token,
    lid,
    scope,
    // ✅ BUNU cookies.ts OKUYOR: verifiedSlug
    verifiedSlug: scope === "landing" ? (verifiedSlug || slug) : null,
    iat: now,
    exp: now + Math.max(60, ATTRIB_TTL_SEC),
  };

  const payloadJson = JSON.stringify(payload);
  const p = b64urlUtf8(payloadJson);
  const sig = await hmacHex(payloadJson, HMAC_SECRET);
  const cookieValue = `${p}.${sig}`;

  // --- 3) redirect + cookie set
  const res = NextResponse.redirect(url.toString(), 302);
  const secure = url.protocol === "https:";

  res.cookies.set(REF_COOKIE, cookieValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });

  // Debug cookie tarayıcıda GÖRÜNÜR (httpOnly=false)
  res.cookies.set(DEBUG_COOKIE, `ok_${payload.scope}_${payload.verifiedSlug || "na"}_${payload.lid}`, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });

  res.headers.set("Cache-Control", "no-store");
  // ekstra debug header (Network'te 302'de göreceksin)
  res.headers.set("x-cabo-mw", "set_cookie_ok");

  return res;
}