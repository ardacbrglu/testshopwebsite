import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listProductsWithPricing, getBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const c = await cookies();
  const hasRef = Boolean(c.get("cabo_ref") || c.get("caboRef"));

  if (slug) {
    const p = getBySlug(slug, hasRef);
    if (!p) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: p }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { ok: true, data: listProductsWithPricing(hasRef) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
