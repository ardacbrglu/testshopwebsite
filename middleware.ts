import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Referans cookie adı: lib/cookies.ts ile uyumlu */
const REF_COOKIE = "cabo_attrib";

/** Kabul edilen parametre anahtarları */
const TOKEN_KEYS = ["cabo", "token", "cabo_token", "cabotoken", "t", "ref", "r"];
const LID_KEYS   = ["lid", "linkid", "link_id", "linkId", "l"];

export function middleware(req: NextRequest) {
  // Sadece GET isteklerinde çalışalım (POST/PATCH yönlendirilmesin)
  if (req.method !== "GET") return NextResponse.next();

  const url = req.nextUrl;
  const sp = url.searchParams;

  // 1) URL'den token/lid oku
  let token: string | undefined;
  for (const k of TOKEN_KEYS) {
    const v = sp.get(k);
    if (v) { token = v; break; }
  }
  let lid: string | undefined;
  for (const k of LID_KEYS) {
    const v = sp.get(k);
    if (v) { lid = v; break; }
  }

  // Hiçbiri yoksa devam
  if (!token && !lid) return NextResponse.next();

  // 2) URL'i temizleyip redirect edeceğiz
  const clean = new URL(url);
  [...TOKEN_KEYS, ...LID_KEYS].forEach((k) => clean.searchParams.delete(k));

  const res = NextResponse.redirect(clean);

  // 3) Referral cookie yaz
  const days = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Math.max(1, Math.round(days * 86400));
  const nowSec = Math.floor(Date.now() / 1000);
  const value = encodeURIComponent(JSON.stringify({ token, lid, ts: nowSec }));

  res.cookies.set(REF_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  // (İsteğe bağlı) debug amaçlı iki açık cookie – DevTools’ta görürsünüz
  const lastSeg = url.pathname.split("/").filter(Boolean).pop() || "";
  res.cookies.set("cabo_landing_slug", lastSeg, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  res.cookies.set("cabo_seen_at", String(nowSec), {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return res;
}

/** Statik dosyaları ve API’yi hariç tut */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
