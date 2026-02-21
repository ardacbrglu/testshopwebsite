// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

/**
 * TestShop — Cabo Attribution Middleware
 *
 * Amaç:
 * - URL'de token & lid varsa -> Cabo Verify çağır
 * - Verify ok ise -> HMAC'li attribution cookie ("cabo_attrib") set et
 * - Sonra URL'den token/lid temizlemek için redirect yap
 */

const REF_COOKIE = "cabo_attrib";
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

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  const token = (url.searchParams.get("token") || "").trim();
  const lid = parsePositiveInt(url.searchParams.get("lid"));
  if (!token || !lid) return NextResponse.next();

  if (!isLikelyValidToken(token)) return NextResponse.next();
  if (!VERIFY_URL || !HMAC_SECRET) return NextResponse.next();

  const slug = safeSlugFromPath(url.pathname);

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
      const data = (await r.json().catch(() => null)) as any;
      if (data && data.ok === true) {
        verifyOk = true;
        verifiedSlug = typeof data.slug === "string" ? data.slug : null;
      }
    }
  } catch {
    verifyOk = false;
  }

  if (!verifyOk) {
    url.searchParams.delete("token");
    url.searchParams.delete("lid");
    return NextResponse.redirect(url.toString(), 302);
  }

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

  url.searchParams.delete("token");
  url.searchParams.delete("lid");

  const res = NextResponse.redirect(url.toString(), 302);
  const secure = url.protocol === "https:";

  res.cookies.set(REF_COOKIE, cookieValue, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });

  res.headers.set("Cache-Control", "no-store");
  return res;
}