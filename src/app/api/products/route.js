import { NextResponse } from "next/server";
import { listProductsWithPricing, getBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (slug) {
    const p = getBySlug(slug);
    if (!p) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: p }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, data: listProductsWithPricing() }, { headers: { "Cache-Control": "no-store" } });
}
