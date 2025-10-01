import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const token = url.searchParams.get("token");
  const lid = url.searchParams.get("lid");

  if (token || lid) {
    const days = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
    const maxAge = Math.max(1, Math.round(days * 24 * 60 * 60));
    const value = encodeURIComponent(JSON.stringify({
      token: token || undefined,
      lid: lid || undefined,
      ts: Math.floor(Date.now() / 1000),
    }));
    const res = NextResponse.next();
    res.cookies.set("cabo_attrib", value, {
      httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/", maxAge,
    });
    // URL temiz kalsın (paramları bırakmak istersen bu bloğu kaldır)
    url.searchParams.delete("token");
    url.searchParams.delete("lid");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
