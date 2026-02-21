// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

/**
 * TestShop — Cabo Attribution Middleware (DEBUG'lı)
 *
 * - token&lid varsa Cabo verify çağırır
 * - OK ise cabo_attrib cookie set eder + URL'den token/lid temizler
 * - FAIL ise URL temizler ama cabo_attrib set etmez
 * - FAIL detayını kısa süreli cabo_debug cookie ile yazar (debug için)
 */

const REF_COOKIE = "cabo_attrib";
const DEBUG_COOKIE = "cabo_debug";

const TTL_DAYS = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
const ATTRIB_TTL_SEC = Number(process.env.CABO_ATTRIB_TTL_SEC || 36000);

const VERIFY_BASE = String(process.env.CABO_VERIFY_URL || "").trim(); // Örn: https://cabo-domain.com/api/testshop_verify
const HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim();
const DEBUG = String(process.env.CABO_DEBUG || "1") === "1"; // prod’da istersen 0 yaparsın

function b64url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacHex(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
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

function setDebug(res: NextResponse, secure: boolean, msg: string) {
  if (!DEBUG) return;
  // kısa ve okunur kalsın
  const v = msg.slice(0, 380);
  res.cookies.set(DEBUG_COOKIE, v, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 dakika
  });
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  const token = (url.searchParams.get("token") || "").trim();
  const lid = parsePositiveInt(url.searchParams.get("lid"));
  if (!token || !lid) return NextResponse.next();

  if (!isLikelyValidToken(token)) return NextResponse.next();

  // env yoksa hiç dokunma (URL de temizlenmesin ki anlayalım)
  if (!VERIFY_BASE || !HMAC_SECRET) return NextResponse.next();

  const slug = safeSlugFromPath(url.pathname);

  const verifyUrl = `${VERIFY_BASE.replace(/\/$/, "")}/verify`;
  const secure = url.protocol === "https:";

  let verifyOk = false;
  let verifiedSlug: string | null = null;

  let debugStatus = "no_call";
  let debugBody = "";

  try {
    const r = await fetch(verifyUrl, {
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

    debugStatus = `status=${r.status}`;

    const text = await r.text().catch(() => "");
    debugBody = text.slice(0, 220);

    // tekrar json parse etmeye çalış
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}

    if (r.ok && data && data.ok === true) {
      verifyOk = true;
      verifiedSlug = typeof data.slug === "string" ? data.slug : null;
    }
  } catch (e: any) {
    debugStatus = `fetch_error=${String(e?.message || e).slice(0, 120)}`;
  }

  // URL her durumda temizlensin (senin istediğin davranış)
  url.searchParams.delete("token");
  url.searchParams.delete("lid");

  // FAIL: cookie yok ama debug cookie var
  if (!verifyOk) {
    const res = NextResponse.redirect(url.toString(), 302);
    res.headers.set("Cache-Control", "no-store");
    setDebug(res, secure, `FAIL verifyUrl=${verifyUrl} ${debugStatus} body=${debugBody}`);
    return res;
  }

  // OK: attribution cookie set et
  const now = Math.floor(Date.now() / 1000);
  const scopeEnv = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").trim();
  const scope = scopeEnv === "landing" ? "landing" : "sitewide";

  const payload = {
    v: 1,
    token,
    lid,
    scope,
    landingSlug: scope === "landing" ? (verifiedSlug || slug) : null,
    iat: now,
    exp: now + Math.max(60, ATTRIB_TTL_SEC),
  };

  const payloadJson = JSON.stringify(payload);
  const p = b64url(payloadJson);
  const sig = await hmacHex(payloadJson, HMAC_SECRET);
  const cookieValue = `${p}.${sig}`;

  const res = NextResponse.redirect(url.toString(), 302);

  res.cookies.set(REF_COOKIE, cookieValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });

  // debug cookie: success
  setDebug(res, secure, `OK verifyUrl=${verifyUrl} lid=${lid} scope=${scope} vSlug=${verifiedSlug || ""}`);

  res.headers.set("Cache-Control", "no-store");
  return res;
}