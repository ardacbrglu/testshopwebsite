// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

/**
 * TestShop — Cabo Attribution Middleware (PROD)
 *
 * FIX:
 * - Railway edge ortamında req.url bazen internal origin (https://localhost:8080) dönebiliyor.
 * - Cabo allowlist kontrolü için "public origin" hesaplayıp x-testshop-origin olarak onu gönderiyoruz.
 *
 * Akış:
 * - URL'de token & lid varsa Cabo Verify çağır
 * - Verify OK ise attribution cookie ("cabo_attrib") set et
 * - URL'den token/lid temizlemek için redirect yap
 *
 * Not:
 * - Middleware fetch istekleri browser Network tabında görünmez.
 *   Bu yüzden verify sonucunu response header + cabo_debug cookie ile görünür kılıyoruz.
 */

const REF_COOKIE = "cabo_attrib";
const DEBUG_COOKIE = "cabo_debug";

const TTL_DAYS = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
const ATTRIB_TTL_SEC = Number(process.env.CABO_ATTRIB_TTL_SEC || 36000);

const VERIFY_URL = String(process.env.CABO_VERIFY_URL || "").trim(); // e.g. https://cabo.../api/testshop_verify
const HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim();
const ATTR_SCOPE_ENV = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").trim();

// Opsiyonel override (istersen ekleyebilirsin):
// CABO_PUBLIC_ORIGIN=https://testshopwebsite-production.up.railway.app
const PUBLIC_ORIGIN_OVERRIDE = String(process.env.CABO_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");

function b64url(input: string) {
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

function setDebugCookie(res: NextResponse, val: string, url: URL) {
  res.cookies.set(DEBUG_COOKIE, val.slice(0, 180), {
    httpOnly: false, // DEBUG: devtools'ta görünür olsun
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1h
  });
}

function firstHeaderValue(h: string | null) {
  if (!h) return "";
  // "a,b,c" gelirse ilkini al
  return h.split(",")[0]?.trim() || "";
}

/**
 * Railway/Proxy arkasında gerçek public origin hesapla.
 * - x-forwarded-proto + x-forwarded-host (en doğru)
 * - yoksa host + req.url protokolü fallback
 * - override env varsa onu kullan
 */
function getPublicOrigin(req: NextRequest, url: URL) {
  if (PUBLIC_ORIGIN_OVERRIDE) return PUBLIC_ORIGIN_OVERRIDE;

  const xfProto = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const xfHost = firstHeaderValue(req.headers.get("x-forwarded-host"));

  const host = xfHost || firstHeaderValue(req.headers.get("host")) || url.host;
  const proto = xfProto || url.protocol.replace(":", "") || "https";

  if (!host) return url.origin.replace(/\/+$/, "");

  return `${proto}://${host}`.replace(/\/+$/, "");
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  const token = (url.searchParams.get("token") || "").trim();
  const lid = parsePositiveInt(url.searchParams.get("lid"));

  if (!token || !lid) return NextResponse.next();

  if (!isLikelyValidToken(token)) {
    url.searchParams.delete("token");
    url.searchParams.delete("lid");
    const res = NextResponse.redirect(url.toString(), 302);
    res.headers.set("x-cabo-mw", "fail:bad_token");
    setDebugCookie(res, `fail_bad_token_${Date.now()}`, url);
    return res;
  }

  if (!VERIFY_URL || !HMAC_SECRET) {
    url.searchParams.delete("token");
    url.searchParams.delete("lid");
    const res = NextResponse.redirect(url.toString(), 302);
    res.headers.set("x-cabo-mw", "fail:missing_env");
    setDebugCookie(res, `fail_missing_env_${Date.now()}`, url);
    return res;
  }

  const slug = safeSlugFromPath(url.pathname);

  let verifyStatus = 0;
  let verifyOk = false;
  let verifiedSlug: string | null = null;

  const forwarded: Record<string, string> = {};

  // ✅ gerçek public origin
  const publicOrigin = getPublicOrigin(req, url);

  try {
    const r = await fetch(`${VERIFY_URL.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // ✅ Cabo allowlist için doğru origin:
        "x-testshop-origin": publicOrigin,
        // meta:
        "x-testshop-ua": req.headers.get("user-agent") || "",
        "x-testshop-referer": req.headers.get("referer") || "",
      },
      body: JSON.stringify({ token, lid, slug }),
      cache: "no-store",
    });

    verifyStatus = r.status;

    // Cabo debug header’larını yakala
    const h = r.headers;
    const keys = ["x-cabo-origin", "x-cabo-claimed", "x-cabo-allowed", "x-cabo-allowed-origin"];
    for (const k of keys) {
      const v = h.get(k);
      if (v) forwarded[k] = v;
    }

    if (r.ok) {
      const dataUnknown = await r.json().catch(() => null);
      if (dataUnknown && typeof dataUnknown === "object") {
        const data = dataUnknown as Record<string, unknown>;
        if (data.ok === true) {
          verifyOk = true;
          verifiedSlug = typeof data.slug === "string" ? data.slug : null;
        }
      }
    }
  } catch {
    verifyOk = false;
    verifyStatus = 0;
    forwarded["x-cabo-allowed"] = "fetch_error";
  }

  // URL temizle
  url.searchParams.delete("token");
  url.searchParams.delete("lid");

  if (!verifyOk) {
    const res = NextResponse.redirect(url.toString(), 302);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("x-cabo-mw", `fail:verify_http_${verifyStatus || "0"}:${verifyStatus || "0"}`);
    res.headers.set("x-cabo-status", String(verifyStatus || 0));

    // debug forward
    for (const [k, v] of Object.entries(forwarded)) res.headers.set(k, v);

    // Ek debug: middleware’in hesapladığı publicOrigin’i de göster
    res.headers.set("x-testshop-public-origin", publicOrigin);

    setDebugCookie(res, `fail_verify_http_${verifyStatus || 0}_${Date.now()}`, url);
    return res;
  }

  // OK => attribution cookie
  const now = Math.floor(Date.now() / 1000);
  const scope = ATTR_SCOPE_ENV === "landing" ? "landing" : "sitewide";

  const payload = {
    v: 1,
    token,
    lid,
    scope,
    verifiedSlug: scope === "landing" ? (verifiedSlug || slug) : null,
    iat: now,
    exp: now + Math.max(60, ATTRIB_TTL_SEC),
  };

  const payloadJson = JSON.stringify(payload);
  const p = b64url(payloadJson);
  const sig = await hmacHex(payloadJson, HMAC_SECRET);
  const cookieValue = `${p}.${sig}`;

  const res = NextResponse.redirect(url.toString(), 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("x-cabo-mw", "ok:set_cookie");
  res.headers.set("x-cabo-status", String(verifyStatus || 200));

  for (const [k, v] of Object.entries(forwarded)) res.headers.set(k, v);
  res.headers.set("x-testshop-public-origin", publicOrigin);

  res.cookies.set(REF_COOKIE, cookieValue, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });

  setDebugCookie(res, `ok_${Date.now()}`, url);

  return res;
}