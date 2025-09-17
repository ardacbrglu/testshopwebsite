// src/app/api/products/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listProductsWithPricing, getBySlug } from "@/lib/db";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  // Next 15: cookies() async
  const c = await cookies();
  const caboRef =
    c.get("cabo_ref")?.value || c.get("caboRef")?.value || null;
  const hasRef = Boolean(caboRef);

  if (slug) {
    const p = getBySlug(slug, hasRef);
    if (!p) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: p }, { headers: { "Cache-Control": "no-store" } });
  }

  const list = listProductsWithPricing(hasRef);
  return NextResponse.json({ ok: true, data: list }, { headers: { "Cache-Control": "no-store" } });
}
