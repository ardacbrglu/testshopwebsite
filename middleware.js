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
  const product = url.searchParams.get("p") || ""; // single scope için ürün slug
  const scope = url.searchParams.get("scope") || process.env.ATTR_DEFAULT_SCOPE || "sitewide";

  // d parametresi yoksa env'den otomatik indirim uygula (sitewide yapı için)
  const autoPct = parseInt(process.env.AUTO_DISCOUNT_PCT || "0", 10);
  const discountParam = parseInt(url.searchParams.get("d") || "", 10);
  const discountPct = Number.isFinite(discountParam) ? discountParam : autoPct;

  if (ref && lid) {
    const secret = process.env.TESTSHOP_COOKIE_SECRET || "dev-secret";
    const payload = JSON.stringify({
      ver: 1,
      ref,
      lid,
      scope,
      product,
      discountPct: Math.max(0, Math.min(90, discountPct || 0)),
      ts: Date.now(),
      rid: randomUUID()
    });
    const sig = sign(payload, secret);
    const value = Buffer.from(payload, "utf8").toString("base64") + "." + sig;

    const res = NextResponse.redirect(new URL(url.pathname, req.url));
    res.cookies.set("cabo_attrib", value, {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/",
      maxAge: 14 * 24 * 60 * 60
    });
    return res;
  }

  return NextResponse.next();
}
