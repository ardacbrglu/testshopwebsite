import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "caboRef";
const TTL_SECONDS = 30 * 60; // 30 dk "sticky" attribution

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  // token=cabo_ref ikisini de kabul et
  const token = url.searchParams.get("token") || url.searchParams.get("cabo_ref");

  // sadece sayfa isteklerinde devreye al
  if (token && req.method === "GET" && !url.pathname.startsWith("/api/")) {
    const res = NextResponse.next();
    res.cookies.set({
      name: COOKIE_NAME,
      value: token,
      maxAge: TTL_SECONDS,
      httpOnly: false,   // client’tan okunması sorun değil (sadece indirim için)
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    // URL’i temizleyelim
    url.searchParams.delete("token");
    url.searchParams.delete("cabo_ref");
    res.headers.set("x-middleware-clean-url", "1");
    return NextResponse.redirect(url, { headers: res.headers });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/ref).*)"], // ref redirect endpointini hariç tut
};
