// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const REF_COOKIE = "cabo_attrib";
const TOKEN_KEYS = ["cabo", "token", "cabo_token", "cabotoken", "t", "ref", "r"];
const LID_KEYS = ["lid", "linkid", "link_id", "linkId", "l"];

export function middleware(req: NextRequest) {
  if (req.method !== "GET") return NextResponse.next();

  const url = req.nextUrl;
  const sp = url.searchParams;

  let token: string | undefined;
  for (const k of TOKEN_KEYS) {
    const v = sp.get(k);
    if (v) {
      token = v;
      break;
    }
  }

  let lid: string | undefined;
  for (const k of LID_KEYS) {
    const v = sp.get(k);
    if (v) {
      lid = v;
      break;
    }
  }

  if (!token && !lid) return NextResponse.next();

  // temiz URL'e redirect
  const clean = new URL(url);
  [...TOKEN_KEYS, ...LID_KEYS].forEach((k) => clean.searchParams.delete(k));
  const res = NextResponse.redirect(clean);

  // landing slug (son path parçası)
  const lastSeg = url.pathname.split("/").filter(Boolean).pop() || null;
  const nowSec = Math.floor(Date.now() / 1000);
  const days = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Math.max(1, Math.round(days * 86400));

  // ✅ ÖNEMLİ: encodeURIComponent YOK! Next zaten cookie value'yu güvenli şekilde encode eder.
  const value = JSON.stringify({ token, lid, slug: lastSeg, ts: nowSec });

  res.cookies.set(REF_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
