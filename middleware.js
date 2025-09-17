// middleware.js
import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function middleware(req) {
  const url = req.nextUrl;
  const ref = url.searchParams.get("ref");
  const lid = url.searchParams.get("lid");

  if (ref && lid) {
    const scope = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase(); // sitewide|landing
    const landingProduct = url.searchParams.get("p") || ""; // landing modunda kullanılır

    const secret = process.env.TESTSHOP_COOKIE_SECRET || process.env.CABO_HMAC_SECRET || "dev-secret";
    const payload = JSON.stringify({
      ver: 1,
      ref, lid, scope,
      landingProduct,
      ts: Date.now(),
      rid: randomUUID()
    });
    const sig = sign(payload, secret);
    const value = Buffer.from(payload, "utf8").toString("base64") + "." + sig;

    const days = parseInt(process.env.CABO_COOKIE_TTL_DAYS || "14", 10);
    const res = NextResponse.redirect(new URL(url.pathname, req.url));
    res.cookies.set("cabo_attrib", value, {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/",
      maxAge: days * 24 * 60 * 60
    });
    return res;
  }

  return NextResponse.next();
}
