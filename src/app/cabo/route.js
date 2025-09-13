import { NextResponse } from "next/server";

/**
 * Captures Cabo referral and redirects.
 * Usage: /cabo?ref=TOKEN&to=/products/product-a
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") || searchParams.get("token");
  const to = searchParams.get("to") || "/products";
  const res = NextResponse.redirect(new URL(to, req.url));
  if (ref) {
    const maxAge = 60 * 60 * 24 * 14; // 14 days
    res.cookies.set("caboRef", ref, { httpOnly: true, secure: true, sameSite: "lax", maxAge });
  }
  return res;
}
