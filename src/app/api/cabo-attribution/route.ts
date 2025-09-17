// src/app/api/cabo-attribution/route.ts
import { NextResponse } from "next/server";
import { getCaboConfig } from "@/lib/cabo-integration";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  const slug = (url.searchParams.get("slug") || "").trim();
  const { cookieTtlDays } = getCaboConfig();

  if (!token) return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });

  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const maxAge = Math.max(1, cookieTtlDays) * 24 * 60 * 60;

  // [CABO-INTEGRATION] Merchant değiştirmemeli
  res.cookies.set("cabo_ref", token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge });
  if (slug) res.cookies.set("cabo_landing_slug", slug, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge });

  return res;
}
