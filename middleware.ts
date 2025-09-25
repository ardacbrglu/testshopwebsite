// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

function b64(str: string) {
  return btoa(unescape(encodeURIComponent(str)));
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const token = sp.get("token");
  if (!token) return NextResponse.next();

  // random tab id (wid)
  const rand = crypto.getRandomValues(new Uint8Array(16));
  const wid = Array.from(rand).map(b => b.toString(16).padStart(2, "0")).join("");

  const payload = {
    token,
    lid: sp.get("lid") || null,
    scope: (process.env.CABO_ATTRIBUTION_SCOPE === "landing" ? "landing" : "sitewide") as "landing" | "sitewide",
    landingProduct: sp.get("landing") || sp.get("lp") || sp.get("slug") || null,
    pc: sp.get("pc") || null,
    pid: sp.get("pid") || null,
    iat: Math.floor(Date.now() / 1000),
    wid
  };

  const secret = process.env.TESTSHOP_COOKIE_SECRET || process.env.CABO_HMAC_SECRET || "dev-secret";
  const raw = JSON.stringify(payload);
  const sig = await hmacHex(secret, raw);
  const cookieVal = `${b64(raw)}.${sig}`;

  // query’yi temizle
  ["token","lid","scope","landing","lp","slug","pc","pid"].forEach(k => sp.delete(k));
  const clean = new URL(url); clean.search = sp.toString();

  const res = NextResponse.redirect(clean, 302);
  res.cookies.set({
    name: "cabo_attrib",
    value: cookieVal,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    // SESSION cookie — bilerek maxAge yok
  });
  // Bilgi amaçlı (client JS wid'i sessionStorage'a yazar)
  res.headers.set("x-cabo-window", wid);
  return res;
}

export const config = { matcher: ["/((?!_next|api/).*)"] };
