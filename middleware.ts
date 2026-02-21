// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

/**
 * TestShop — Cabo Attribution Middleware (Debuggable)
 *
 * Flow:
 * - URL'de token & lid varsa:
 *   1) Cabo Verify çağır (server-side, Network panelde görünmez)
 *   2) OK => cabo_attrib cookie set + URL temizlenir (302)
 *   3) FAIL => sadece URL temizlenir (302) + cabo_debug fail reason set
 *
 * Debug:
 * - cabo_debug cookie: ok_* / fail_* / skip_*
 * - x-cabo-mw header: kısa özet (Response Headers'ta görünür)
 */

const REF_COOKIE = "cabo_attrib";
const DEBUG_COOKIE = "cabo_debug";

const TTL_DAYS = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
const ATTRIB_TTL_SEC = Number(process.env.CABO_ATTRIB_TTL_SEC || 36000);

const VERIFY_URL = String(process.env.CABO_VERIFY_URL || "").trim(); // e.g. https://cabo.../api/testshop_verify
const HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim(); // TestShop cookie signing secret

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

function setDebug(res: NextResponse, val: string) {
  const secure = true; // railway https
  res.cookies.set(DEBUG_COOKIE, val, {
    httpOnly: false, // debug amaçlı görünür olsun
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 saat
  });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  const token = (url.searchParams.get("token") || "").trim();
  const lid = parsePositiveInt(url.searchParams.get("lid"));

  // token/lid yoksa dokunma
  if (!token || !lid) return NextResponse.next();

  // basic validation
  if (!isLikelyValidToken(token)) {
    const clean = new URL(url.toString());
    clean.searchParams.delete("token");
    clean.searchParams.delete("lid");
    const res = NextResponse.redirect(clean.toString(), 302);
    res.headers.set("x-cabo-mw", "skip:bad_token");
    setDebug(res, `skip_bad_token_${Date.now()}`);
    return res;
  }

  // env check
  if (!VERIFY_URL) {
    const clean = new URL(url.toString());
    clean.searchParams.delete("token");
    clean.searchParams.delete("lid");
    const res = NextResponse.redirect(clean.toString(), 302);
    res.headers.set("x-cabo-mw", "fail:missing_verify_url");
    setDebug(res, `fail_missing_verify_url_${Date.now()}`);
    return res;
  }
  if (!HMAC_SECRET) {
    const clean = new URL(url.toString());
    clean.searchParams.delete("token");
    clean.searchParams.delete("lid");
    const res = NextResponse.redirect(clean.toString(), 302);
    res.headers.set("x-cabo-mw", "fail:missing_hmac_secret");
    setDebug(res, `fail_missing_hmac_secret_${Date.now()}`);
    return res;
  }

  const slug = safeSlugFromPath(url.pathname);

  // verify
  let verifyOk = false;
  let verifiedSlug: string | null = null;
  let reason = "verify_failed";
  let statusText = "no_status";

  try {
    const verifyEndpoint = `${VERIFY_URL.replace(/\/$/, "")}/verify`;

    const r = await fetch(verifyEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Cabo tarafı allowlist kontrolü için:
        "x-testshop-origin": url.origin,
        "x-testshop-ua": req.headers.get("user-agent") || "",
        "x-testshop-referer": req.headers.get("referer") || "",
      },
      body: JSON.stringify({ token, lid, slug }),
      cache: "no-store",
    });

    statusText = String(r.status);

    if (!r.ok) {
      reason = `verify_http_${r.status}`;
    } else {
      const data: unknown = await r.json().catch(() => null);
      if (typeof data === "object" && data !== null) {
        const obj = data as Record<string, unknown>;
        if (obj.ok === true) {
          verifyOk = true;
          verifiedSlug = typeof obj.slug === "string" ? obj.slug : null;
        } else {
          reason = typeof obj.error === "string" ? `verify_${obj.error}` : "verify_not_ok";
        }
      } else {
        reason = "verify_bad_json";
      }
    }
  } catch (e) {
    reason = `verify_fetch_error`;
    statusText = "fetch_error";
  }

  // URL temizle
  const clean = new URL(url.toString());
  clean.searchParams.delete("token");
  clean.searchParams.delete("lid");

  // FAIL => sadece redirect + debug
  if (!verifyOk) {
    const res = NextResponse.redirect(clean.toString(), 302);
    res.headers.set("x-cabo-mw", `fail:${reason}:${statusText}`);
    setDebug(res, `fail_${reason}_${statusText}_${Date.now()}`);
    return res;
  }

  // SUCCESS => attribution cookie set + debug
  const now = Math.floor(Date.now() / 1000);
  const scopeEnv = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").trim().toLowerCase();
  const scope: "landing" | "sitewide" = scopeEnv === "landing" ? "landing" : "sitewide";

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

  const res = NextResponse.redirect(clean.toString(), 302);

  res.cookies.set(REF_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS * 24 * 60 * 60,
  });

  res.headers.set("Cache-Control", "no-store");
  res.headers.set("x-cabo-mw", "ok:set_cookie");
  setDebug(res, `ok_set_cookie_${Date.now()}`);

  return res;
}