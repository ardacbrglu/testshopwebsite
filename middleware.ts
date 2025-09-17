import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Hangi sayfalarda token yakalayıp cookie set edelim?
export const config = {
  matcher: [
    "/", "/products", "/products/:path*", "/cart", "/orders", "/(api)?",
  ],
};

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const token = url.searchParams.get("token");
  const lid = url.searchParams.get("lid");

  if (!token && !lid) return NextResponse.next();

  // cookie yaz
  const res = NextResponse.next();
  if (token) {
    res.cookies.set("caboRef", token, {
      maxAge: 30 * 24 * 60 * 60, // 30 gün
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
  }

  // UX: URL’i temizle
  url.searchParams.delete("token");
  url.searchParams.delete("lid");
  res.headers.set("x-middleware-cache", "no-cache");

  return NextResponse.redirect(url);
}
