// src/app/api/products/route.js
import { cookies } from "next/headers";
import { listProductsWithPricing, getBySlug } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const resolveHasRefCookie = async () => {
  const c = await cookies();
  const longRef = c.get("cabo_ref")?.value || c.get("caboRef")?.value || null;
  const hasSession = Boolean(c.get("cabo_ref_session")?.value);
  return { hasRef: Boolean(longRef && hasSession) };
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const { hasRef } = await resolveHasRefCookie();

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
