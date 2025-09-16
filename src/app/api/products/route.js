import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { listProductsWithPricing, getBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  // [CABO-INTEGRATION] Ref cookie → indirim görünürlüğü tetikleyicisi
  const c = await cookies();
  const hasRef = !!(c.get("cabo_ref")?.value || c.get("caboRef")?.value);
  const opts = { applyDiscounts: hasRef };

  const slug = searchParams.get("slug");
  if (slug) {
    const p = getBySlug(slug, opts);
    if (!p) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: p }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { ok: true, data: listProductsWithPricing(opts) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
