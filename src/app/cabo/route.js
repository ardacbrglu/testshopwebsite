// src/app/cabo/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") || searchParams.get("token");
  const to = searchParams.get("to") || "/products";

  const res = NextResponse.redirect(new URL(to, req.url));

  if (ref) {
    // uzun cookie
    res.cookies.set("cabo_ref", ref, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    // session cookie
    res.cookies.set("cabo_ref_session", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  }
  return res;
}
