import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

/**
 * TestShop — Cabo Attribution Middleware (FIXED)
 *
 * Fix:
 * - url.origin Railway/edge bazı durumlarda localhost görünebiliyor.
 * - Cabo allowlist için "x-testshop-origin" kesinlikle public origin olmalı.
 * - Public origin'i x-forwarded-host/proto ile hesaplıyoruz.
 */

const REF_COOKIE = "cabo_attrib";
const DEBUG_COOKIE = "cabo_debug";

const TTL_DAYS = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
const ATTRIB_TTL_SEC = Number(process.env.CABO_ATTRIB_TTL_SEC || 36000);

const VERIFY_URL = String(process.env.CABO_VERIFY_URL || "").trim();
const HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim();

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

/**
 * Railway/Proxy safe public origin
 */
function getPublicOrigin(req: NextRequest) {
  const xfHost = (req.headers.get("x-forwarded-host") || "").trim();
  const xfProto = (req.headers.get("x-forwarded-proto") || "").trim() || "https";
  if (xfHost) return `${xfProto}://${xfHost}`;

  // fallback: Host header
  const host = (req.headers.get("host") || "").trim();
  if (host) return `${xfProto}://${host}`;

  // last resort: url.origin
  return new URL(req.url).origin;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  const token = (url.searchParams.get("token") || "").trim();
  const lid = parsePositiveInt(url.searchParams.get("lid"));
  if (!token || !lid) return NextResponse.next();

  // Always clean URL afterwards
  url.searchParams.delete("token");
  url.searchParams.delete("lid");

  const resRedirect = NextResponse.redirect(url.toString(), 302);
  const secure = true;

  // Quick validations
  if (!isLikelyValidToken(token)) {
    resRedirect.cookies.set(DEBUG_COOKIE, `fail_bad_token_${Date.now()}`, {
      path: "/",
      maxAge: 3600,
      secure,
      sameSite: "lax",
    });
    return resRedirect;
  }
  if (!VERIFY_URL) {
    resRedirect.cookies.set(DEBUG_COOKIE, `fail_missing_VERIFY_URL_${Date.now()}`, {
      path: "/",
      maxAge: 3600,
      secure,
      sameSite: "lax",
    });
    return resRedirect;
  }
  if (!HMAC_SECRET) {
    resRedirect.cookies.set(DEBUG_COOKIE, `fail_missing_HMAC_SECRET_${Date.now()}`, {
      path: "/",
      maxAge: 3600,
      secure,
      sameSite: "lax",
    });
    return resRedirect;
  }

  const slug = safeSlugFromPath(new URL(req.url).pathname);
  const publicOrigin = getPublicOrigin(req);

  let verifyOk = false;
  let verifiedSlug: string | null = null;
  let failReason = "unknown";

  try {
    const verifyEndpoint = `${VERIFY_URL.replace(/\/$/, "")}/verify`;

    const r = await fetch(verifyEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // ✅ critical: must match Cabo TESTSHOP_ORIGIN exactly
        "x-testshop-origin": publicOrigin,
        "x-testshop-ua": req.headers.get("user-agent") || "",
        "x-testshop-referer": req.headers.get("referer") || "",
      },
      body: JSON.stringify({ token, lid, slug }),
      cache: "no-store",
    });

    if (r.ok) {
      const data = (await r.json().catch(() => null)) as unknown;
      const d = data as Record<string, unknown> | null;
      if (d && d.ok === true) {
        verifyOk = true;
        verifiedSlug = typeof d.slug === "string" ? d.slug : null;
      } else {
        failReason = "bad_json";
      }
    } else {
      failReason = `verify_http_${r.status}`;
    }
  } catch (e) {
    failReason = `verify_fetch_error`;
  }

  if (!verifyOk) {
    // debug cookie only
    resRedirect.cookies.set(DEBUG_COOKIE, `fail_${failReason}_${Date.now()}`, {
      path: "/",
      maxAge: 3600,
      secure,
      sameSite: "lax",
    });
    // also help debugging in headers
    resRedirect.headers.set("x-testshop-public-origin", publicOrigin);
    resRedirect.headers.set("x-testshop-fail", failReason);
    resRedirect.headers.set("Cache-Control", "no-store");
    return resRedirect;
  }

  // Build attribution payload
  const now = Math.floor(Date.now() / 1000);
  const scopeEnv = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").trim();
  const scope = scopeEnv === "landing" ? "landing" : "sitewide";

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

  resRedirect.cookies.set(REF_COOKIE, cookieValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });

  resRedirect.cookies.set(DEBUG_COOKIE, `ok_${Date.now()}`, {
    path: "/",
    maxAge: 3600,
    secure,
    sameSite: "lax",
  });

  resRedirect.headers.set("x-testshop-public-origin", publicOrigin);
  resRedirect.headers.set("Cache-Control", "no-store");
  return resRedirect;
}