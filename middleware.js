// src/middleware.js
import { NextResponse } from "next/server";

export function middleware(req) {
  const url = req.nextUrl;
  const token = url.searchParams.get("token") || url.searchParams.get("ref");
  if (token) {
    const res = NextResponse.next();

    // 1) Uzun süreli (raporlama/ilişkilendirme için)
    res.cookies.set({
      name: "cabo_ref",
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14, // 14 gün
    });

    // 2) Oturum cookie (tarayıcı kapanınca silinir)
    res.cookies.set({
      name: "cabo_ref_session",
      value: "1",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/", // maxAge vermiyoruz -> session cookie
    });

    return res;
  }
  return NextResponse.next();
}

// static dosyalar ve API’leri es geç
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
