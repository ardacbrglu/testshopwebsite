// src/middleware.ts
/**
 * ?lid=... yakalayıp httpOnly cookie (cabo_attrib) olarak yazar, URL'i temizler.
 */
import { NextResponse, NextRequest } from "next/server";

const ATTR_COOKIE = "cabo_attrib";

function ttlSeconds(): number {
  const days = Math.max(1, Number(process.env.CABO_COOKIE_TTL_DAYS || 14));
  return days * 24 * 60 * 60;
}

export function middleware(req: NextRequest) {
  const { searchParams, pathname, origin } = req.nextUrl;
  const lid = searchParams.get("lid");

  if (lid && /^\d+$/.test(lid)) {
    const res = NextResponse.redirect(new URL(pathname, origin));
    const payload = JSON.stringify({ lid: Number(lid), ts: Date.now() });

    res.cookies.set({
      name: ATTR_COOKIE,
      value: payload,
      maxAge: ttlSeconds(),
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
