// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const WID = "cabo_wid";
const LID = "cabo_lid";
const LAND = "cabo_landing_slug";
const SEEN_AT = "cabo_seen_at"; // epoch seconds
const CONSENT = "consent_marketing";

const SCOPE = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase(); // "sitewide" | "landing"
const COOKIE_TTL_DAYS = Math.max(
  1,
  Number.isFinite(Number(process.env.CABO_COOKIE_TTL_DAYS))
    ? Number(process.env.CABO_COOKIE_TTL_DAYS)
    : 14
);
const SEC = 24 * 60 * 60;
const MAX_AGE = COOKIE_TTL_DAYS * SEC;

function setCookie(res: NextResponse, name: string, value: string) {
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
function delCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", { path: "/", maxAge: 0 });
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  // Manuel temizleme: ?clear_ref=1
  if (url.searchParams.get("clear_ref") === "1") {
    const clean = new URL(url);
    clean.searchParams.delete("clear_ref");
    const res = NextResponse.redirect(clean);
    [WID, LID, LAND, SEEN_AT].forEach((n) => delCookie(res, n));
    return res;
  }

  // Ref parametreleri
  const token = url.searchParams.get("token") || url.searchParams.get("wid");
  const lid = url.searchParams.get("lid") || url.searchParams.get("link");
  const hasConsent = req.cookies.get(CONSENT)?.value === "1";

  if (token) {
    if (hasConsent) {
      // Consent var → cookie yaz, URL'yi temizle
      const clean = new URL(url);
      ["token", "wid", "lid", "link"].forEach((k) => clean.searchParams.delete(k));

      const res = NextResponse.redirect(clean);
      setCookie(res, WID, token);
      if (lid) setCookie(res, LID, String(lid));
      if (SCOPE === "landing") {
        const m = url.pathname.match(/^\/products\/([^/]+)/);
        if (m?.[1]) setCookie(res, LAND, m[1]);
      }
      setCookie(res, SEEN_AT, String(Math.floor(Date.now() / 1000)));
      return res;
    } else {
      // Consent yok → cookie yazma, URL üzerinde kalsın (ephemeral)
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
