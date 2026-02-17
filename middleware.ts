// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const CABO_VERIFY_URL = (process.env.CABO_VERIFY_URL || "").trim();
const CABO_COOKIE_TTL_DAYS = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
const CABO_ATTRIB_TTL_SEC = Number(process.env.CABO_ATTRIB_TTL_SEC || 36000);
const CABO_ATTRIBUTION_SCOPE = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide"); // landing|sitewide
const CABO_HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim();

function isProbablyToken(s: string) {
  return typeof s === "string" && s.length >= 16 && s.length <= 256;
}
function isPositiveInt(s: string) {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && Math.floor(n) === n;
}

function b64url(input: string) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(payloadJson: string) {
  if (!CABO_HMAC_SECRET) return "";
  return crypto.createHmac("sha256", CABO_HMAC_SECRET).update(payloadJson).digest("hex");
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const token = (url.searchParams.get("token") || "").trim();
  const lidStr = (url.searchParams.get("lid") || "").trim();

  // token/lid yoksa dokunma
  if (!token && !lidStr) return NextResponse.next();

  // kaba validasyon fail => referral cookie temizle (varsa)
  if (!isProbablyToken(token) || !isPositiveInt(lidStr)) {
    const res = NextResponse.next();
    res.cookies.delete("cabo_attrib");
    return res;
  }

  if (!CABO_VERIFY_URL) {
    const res = NextResponse.next();
    res.cookies.delete("cabo_attrib");
    return res;
  }

  const pathname = url.pathname || "/";
  const parts = pathname.split("/").filter(Boolean);
  const landingSlug =
    parts.length >= 2 && parts[0] === "products" ? parts[1] : null;

  const origin = url.origin; // testshop origin
  const ua = req.headers.get("user-agent") || "";
  const referer = req.headers.get("referer") || "";

  try {
    // Cabo verify (recommended /verify)
    const postTo = CABO_VERIFY_URL.replace(/\/$/, "") + "/verify";

    const r = await fetch(postTo, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-testshop-origin": origin,
        "x-testshop-ua": ua,
        "x-testshop-referer": referer,
      },
      body: JSON.stringify({
        token,
        lid: Number(lidStr),
        slug: landingSlug,
      }),
      cache: "no-store",
    });

    if (!r.ok) {
      const res = NextResponse.next();
      res.cookies.delete("cabo_attrib");
      return res;
    }

    const data = (await r.json().catch(() => null)) as any;
    if (!data?.ok) {
      const res = NextResponse.next();
      res.cookies.delete("cabo_attrib");
      return res;
    }

    // ✅ verified → cookie set + URL temizle
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(60, Math.min(CABO_ATTRIB_TTL_SEC, CABO_COOKIE_TTL_DAYS * 86400));
    const payload = {
      v: 1,
      token,
      lid: Number(lidStr),
      scope: CABO_ATTRIBUTION_SCOPE === "landing" ? "landing" : "sitewide",
      landingSlug: landingSlug || data?.slug || null,
      iat: now,
      exp: now + ttl,
    };

    const json = JSON.stringify(payload);
    const sig = sign(json);
    if (!sig) {
      // HMAC secret yoksa: güvenli değil → cookie set etmeyelim
      const res = NextResponse.next();
      res.cookies.delete("cabo_attrib");
      return res;
    }

    const cookieVal = `${b64url(json)}.${sig}`;

    const cleaned = new URL(req.url);
    cleaned.searchParams.delete("token");
    cleaned.searchParams.delete("lid");

    const res = NextResponse.redirect(cleaned, 302);
    res.cookies.set("cabo_attrib", cookieVal, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: ttl,
    });

    return res;
  } catch {
    const res = NextResponse.next();
    res.cookies.delete("cabo_attrib");
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
