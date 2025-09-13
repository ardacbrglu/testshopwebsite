// app/cabo/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabo Referral Capture
 * - GET /cabo?token=...&target=/products/<slug>
 * - Güvenli şekilde HTTP-Only cookie'ye cabo_ref yazar ve hedefe yönlendirir.
 * Security:
 * - Token whitelist doğrulama (basit regex)
 * - Open-redirect korunumu (target yalnızca site içi path)
 * - Cookie: HttpOnly, Secure, SameSite=Lax, MaxAge: 14 gün
 */

import { NextResponse } from "next/server";

const CABO_REF_COOKIE = "cabo_ref";
const MAX_AGE_S = 14 * 24 * 60 * 60;

function isValidToken(t) {
  // Alfanümerik, _ ve -; 8–128 arası (gerekirse esnet)
  return typeof t === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(t);
}

function sanitizeTarget(target, req) {
  try {
    if (!target || typeof target !== "string") return new URL("/products", req.url);
    // Sadece site içi path kabul (open redirect engeli)
    if (target.startsWith("/")) return new URL(target, req.url);
    return new URL("/products", req.url);
  } catch {
    return new URL("/products", req.url);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const target = searchParams.get("target");

  const dest = sanitizeTarget(target, req);

  const res = NextResponse.redirect(dest, { status: 302 });
  if (isValidToken(token)) {
    res.cookies.set({
      name: CABO_REF_COOKIE,
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_S,
    });
  }
  return res;
}
