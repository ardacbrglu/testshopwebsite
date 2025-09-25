import { NextRequest, NextResponse } from "next/server";

/**
 * Cabo ref yakalama:
 * - ?token=..., ?wid=..., ?ref=..., ?w=...  -> cabo_wid cookie
 * - ?lid=..., ?l=..., ?lander=..., ?landingId=... -> cabo_lid cookie
 * TTL: CABO_COOKIE_TTL_DAYS (yoksa session cookie)
 * Scope=landing ise ilk açılan /products/[slug] yolunu cabo_landing_slug olarak saklar.
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  const wid =
    url.searchParams.get("wid") ||
    url.searchParams.get("token") || // Cabo bazen token gönderir
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

  // URL'i temizle
  const cleaned = new URL(url.toString());
  ["wid", "token", "w", "ref", "cwid", "lid", "l", "lander", "landingId"].forEach((k) =>
    cleaned.searchParams.delete(k)
  );
  const res = NextResponse.redirect(cleaned, 302);

  // Cookie seçenekleri (3. argüman): Partial<ResponseCookie>
  const ttlDaysRaw = process.env.CABO_COOKIE_TTL_DAYS;
  const ttlDays = ttlDaysRaw ? Number(ttlDaysRaw) : 0;

  const cookieOpts: {
    path: string;
    sameSite: "lax" | "strict" | "none";
    maxAge?: number;
  } = { path: "/", sameSite: "lax" };

  if (Number.isFinite(ttlDays) && ttlDays > 0) {
    cookieOpts.maxAge = Math.floor(ttlDays * 86400); // saniye
  }

  if (wid) res.cookies.set("cabo_wid", String(wid), cookieOpts);
  if (lid) res.cookies.set("cabo_lid", String(lid), cookieOpts);

  // Scope=landing ise ilk açılan ürün slug'ını not et
  const scope = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase();
  if (scope === "landing") {
    const already = req.cookies.get("cabo_landing_slug")?.value;
    if (!already) {
      const m = /^\/products\/([^\/\?\#]+)/i.exec(url.pathname);
      if (m?.[1]) {
        res.cookies.set("cabo_landing_slug", m[1], cookieOpts);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|cabo-init.js).*)"],
};
