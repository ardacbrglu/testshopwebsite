import { NextResponse } from "next/server";

/**
 * Captures Cabo referral and redirects.
 * Usage: /cabo?ref=TOKEN&to=/products
 * [CABO-INTEGRATION] cookie standard: cabo_ref
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") || searchParams.get("token");
  const to = searchParams.get("to") || "/products";
  const res = NextResponse.redirect(new URL(to, req.url));
  if (ref) {
    const maxAge = 60 * 60 * 24 * 14; // 14 days
    // Yeni standart cookie
    res.cookies.set("cabo_ref", ref, { httpOnly: true, secure: true, sameSite: "lax", maxAge });
    // Eski adla set edilmiş cookie varsa, ileride temizleyebilmek için paralel yaz (opsiyonel)
    res.cookies.set("caboRef", ref, { httpOnly: true, secure: true, sameSite: "lax", maxAge });
  }
  return res;
}
