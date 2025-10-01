// src/app/api/cart/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cart API — sepette gösterim için indirimleri hesaplar (sitewide)
 * Body:
 *   { items: [{ slug, quantity, unitPrice }] }
 * Response:
 *   { items: [{ ..., finalUnit, applied }], totals: { subtotal, discountTotal, grandTotal } }
 */

import { NextResponse } from "next/server";
import {
  activeDiscountPctForSlugServer,
  calcDiscountedUnitPrice,
} from "@/lib/attribution";

type ReqItem = { slug: string; quantity: number; unitPrice: number };

function round2(n: number) { return Math.max(0, Math.round(n * 100) / 100); }
function bad(msg: string, code = 400) { return NextResponse.json({ ok:false, error: msg }, { status: code }); }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return bad("No items");

    let subtotal = 0;
    let discountTotal = 0;

    const out = [];
    for (const it of items) {
      const q = Math.max(1, Number(it.quantity || 1));
      const unit = Number(it.unitPrice || 0);
      const pct  = await activeDiscountPctForSlugServer(it.slug);
      const { finalPrice, applied } = calcDiscountedUnitPrice(unit, pct);

      const lineTotal = round2(unit * q);
      const linePaid  = round2(finalPrice * q);

      subtotal += lineTotal;
      discountTotal += lineTotal - linePaid;

      out.push({
        slug: it.slug,
        quantity: q,
        unitPrice: unit,
        finalUnit: finalPrice,   // <- UI "finalPrice" bekliyorsa backward alias
        finalPrice: finalPrice,  // backward compatibility (UI’de bu isim kullanılıyor)
        applied,
        discountRate: pct,
        originalLine: lineTotal,
        linePaid,
      });
    }

    const grandTotal = round2(subtotal - discountTotal);

    return NextResponse.json({
      ok: true,
      items: out,
      totals: { subtotal, discountTotal, grandTotal },
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || "Cart failed" }, { status: 500 });
  }
}
