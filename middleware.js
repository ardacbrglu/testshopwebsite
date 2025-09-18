// middleware.js
import { NextResponse } from "next/server";

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };

// Edge ortamında HMAC-SHA256
async function hmacSHA256(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

export async function middleware(req) {
  const url = req.nextUrl;
  const ref = url.searchParams.get("ref");
  const lid = url.searchParams.get("lid");
  if (!ref || !lid) return NextResponse.next();

  const scope = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase(); // sitewide|landing
  const landingProduct = url.searchParams.get("p") || "";
  const secret = process.env.TESTSHOP_COOKIE_SECRET || process.env.CABO_HMAC_SECRET || "dev-secret";
  const payload = JSON.stringify({
    ver: 1,
    ref, lid,
    scope,
    landingProduct,
    ts: Date.now()
  });
  const sig = await hmacSHA256(secret, payload);
  const value = Buffer.from(payload, "utf8").toString("base64") + "." + sig;

  const days = parseInt(process.env.CABO_COOKIE_TTL_DAYS || "14", 10);
  const res = NextResponse.redirect(new URL(url.pathname, req.url));
  res.cookies.set("cabo_attrib", value, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/",
    maxAge: days * 24 * 60 * 60
  });
  return res;
}
