// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const REF_COOKIE = "cabo_attrib";

// Railway/Prod için: CABO_VERIFY_URL = "https://cabo-platform-production.up.railway.app/api/testshop_verify"
function getVerifyUrl() {
  const u = (process.env.CABO_VERIFY_URL || "").trim();
  return u;
}

function safeInt(x: string | null): number | null {
  if (!x) return null;
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function jsonCookieValue(data: { token: string; lid?: number | null; slug?: string | null }) {
  return JSON.stringify({
    token: data.token,
    lid: data.lid ?? null,
    slug: data.slug ?? null,
    ts: Math.floor(Date.now() / 1000),
  });
}

// Basit timeout
async function fetchWithTimeout(input: RequestInfo, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// NOTE: Middleware Edge runtime’da çalışır.
// HMAC signing’i burada yapmayacağız (Edge crypto farklılıkları vs).
// Verify endpoint’i Cabo tarafında yine “origin allowlist + rate limit + dedup click” ile güvenli.
// İstersen sonraki adımda Edge HMAC de ekleriz.
async function verifyWithCabo(args: {
  token: string;
  lid: number | null;
  slug: string | null;
  landingUrl: string;
  userAgent: string;
  referer: string;
  ip: string;
}): Promise<boolean> {
  const url = getVerifyUrl();
  if (!url) return false;

  try {
    const r = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TestShop-Origin": args.landingUrl,
          "X-TestShop-IP": args.ip,
          "X-TestShop-UA": args.userAgent,
          "X-TestShop-Referer": args.referer,
        },
        body: JSON.stringify({
          token: args.token,
          lid: args.lid,
          slug: args.slug,
          landingUrl: args.landingUrl,
        }),
        cache: "no-store",
      },
      2500
    );

    if (!r.ok) return false;
    const j = (await r.json().catch(() => null)) as { ok?: boolean } | null;
    return !!j?.ok;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;

  const token = url.searchParams.get("token")?.trim() || "";
  const lid = safeInt(url.searchParams.get("lid"));
  const slugFromPath =
    url.pathname.startsWith("/products/") ? decodeURIComponent(url.pathname.split("/")[2] || "") : null;

  // Ref param yoksa: hiçbir şey yapma (cookie’yi de silme).
  // (Kullanıcı sonradan aynı session’da ref’siz dolaşsa bile attrib devam edebilir; bu “sitewide” için gerekli.)
  if (!token) {
    const res = NextResponse.next();
    // middleware cache kır
    res.headers.set("x-middleware-cache", "no-cache");
    return res;
  }

  // token var → Cabo verify
  const ua = req.headers.get("user-agent") || "";
  const referer = req.headers.get("referer") || "";
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const landingUrl = url.origin + url.pathname; // query hariç

  const ok = await verifyWithCabo({
    token,
    lid,
    slug: slugFromPath,
    landingUrl,
    userAgent: ua,
    referer,
    ip,
  });

  const res = NextResponse.next();
  res.headers.set("x-middleware-cache", "no-cache");

  if (ok) {
    res.cookies.set(REF_COOKIE, jsonCookieValue({ token, lid, slug: slugFromPath }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Number(process.env.CABO_COOKIE_TTL_DAYS || 14) * 24 * 60 * 60,
    });
  } else {
    // token invalid → cookie temizle ki “refsiz” gibi davransın
    res.cookies.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
  }

  return res;
}

// Static dosyalar hariç her şeye çalışsın
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
