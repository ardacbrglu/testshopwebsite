import { NextRequest, NextResponse } from "next/server";

// Cabo ref: bazen ?wid=..., bazen ?token=... gelebiliyor.
// Hepsini yakalayıp çereze yazıyoruz, sonra URL'i temizliyoruz.
export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  const wid =
    url.searchParams.get("wid") ||
    url.searchParams.get("token") || // <- önemli düzeltme
    url.searchParams.get("w") ||
    url.searchParams.get("ref") ||
    url.searchParams.get("cwid");

  const lid =
    url.searchParams.get("lid") ||
    url.searchParams.get("l") ||
    url.searchParams.get("lander") ||
    url.searchParams.get("landingId");

  if (!wid && !lid) {
    return NextResponse.next();
  }

  // Parametreleri URL'den çıkarıp temiz bir adrese yönlendir
  const cleaned = new URL(url.toString());
  ["wid", "token", "w", "ref", "cwid", "lid", "l", "lander", "landingId"].forEach((k) =>
    cleaned.searchParams.delete(k)
  );

  const res = NextResponse.redirect(cleaned, 302);

  // Session cookie (SameSite=Lax top-level gezintide çalışır)
  if (wid) res.cookies.set("cabo_wid", wid, { path: "/", sameSite: "lax" });
  if (lid) res.cookies.set("cabo_lid", lid, { path: "/", sameSite: "lax" });

  return res;
}

export const config = {
  // Tüm sayfalarda çalışsın; statik dosyaları ve özel endpointi hariç tut.
  matcher: ["/((?!_next|favicon.ico|cabo-init.js).*)"],
};
