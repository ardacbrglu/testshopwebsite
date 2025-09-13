// app/cabo/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || url.searchParams.get("ref") || "").trim();
  const target = (url.searchParams.get("target") || "/").trim();

  const dest = target.startsWith("http")
    ? target
    : `${url.origin}${target.startsWith("/") ? "" : "/"}${target}`;

  const res = NextResponse.redirect(dest, 302);

  if (token) {
    // 14 gün geçerli first-party cookie
    res.cookies.set({
      name: "cabo_ref",
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  }
  return res;
}
