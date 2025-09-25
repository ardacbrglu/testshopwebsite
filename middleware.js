import { NextResponse } from "next/server";

/** Edge/Web Crypto HMAC-SHA256 -> hex */
async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** UTF-8 safe base64 */
function b64(str) {
  // Edge runtime’da Buffer yok; btoa için unicode koruması:
  return btoa(unescape(encodeURIComponent(str)));
}

export async function middleware(req) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // Cabo query’leri
  const token = sp.get("token");
  if (!token) return NextResponse.next();

  const payload = {
    token,
    lid: sp.get("lid") || null,
    scope: sp.get("scope") || "landing",
    landingProduct:
      sp.get("landing") || sp.get("lp") || sp.get("slug") || null,
    pc: sp.get("pc") || null,
    pid: sp.get("pid") || null,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret =
    process.env.TESTSHOP_COOKIE_SECRET ||
    process.env.CABO_HMAC_SECRET ||
    "dev-secret";

  const raw = JSON.stringify(payload);
  const sig = await hmacHex(secret, raw);
  const cookieVal = `${b64(raw)}.${sig}`;

  // Query’yi temizle
  ["token", "lid", "scope", "landing", "lp", "slug", "pc", "pid"].forEach((k) =>
    sp.delete(k)
  );
  const clean = new URL(url);
  clean.search = sp.toString();

  const res = NextResponse.redirect(clean, 302);
  res.cookies.set("cabo_attrib", cookieVal, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 gün
  });
  return res;
}

// _next ve api hariç her yerde çalışsın
export const config = {
  matcher: ["/((?!_next|api/).*)"],
};
