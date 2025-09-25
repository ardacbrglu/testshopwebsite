import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const wid = url.searchParams.get("wid");
  const lid = url.searchParams.get("lid");

  if (!wid && !lid) return NextResponse.next();

  // wid/lid paramlarını URL'den temizle
  const cleaned = new URL(url.toString());
  if (wid) cleaned.searchParams.delete("wid");
  if (lid) cleaned.searchParams.delete("lid");

  const res = NextResponse.redirect(cleaned, 302);
  // Oturum (session) çerezi; süre vermiyoruz
  if (wid) res.cookies.set("cabo_wid", wid, { httpOnly: false, sameSite: "lax", path: "/" });
  if (lid) res.cookies.set("cabo_lid", lid, { httpOnly: false, sameSite: "lax", path: "/" });
  return res;
}

export const config = {
  // Her sayfada çalışsın, ama static dosyaları ve API health’i pas geç
  matcher: ["/((?!_next|favicon.ico|cabo-init.js).*)"],
};
