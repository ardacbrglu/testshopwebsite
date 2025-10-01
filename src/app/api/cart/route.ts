// src/app/api/cart/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cart API — sepette gösterim için indirimleri hesaplar (sitewide)
 *
 * Request body:
 *   { items: [{ slug: string; quantity: number; unitPrice: number }] }
 *
 * Response:
 *   {
 *     ok: true,
 *     items: [{
 *       slug, quantity, unitPrice, finalUnit, finalPrice, applied, discountRate,
 *       originalLine, linePaid
 *     }],
 *     totals: { subtotal, discountTotal, grandTotal }
 *   }
 */

import { NextResponse } from "next/server";
import {
  activeDiscountPctForSlugServer,
  calcDiscountedUnitPrice,
} from "@/lib/attribution";

type ReqItem = { slug: string; quantity: number; unitPrice: number };
type ReqBody = { items: ReqItem[] };

type CartItemOut = {
  slug: string;
  quantity: number;
  unitPrice: number;
  finalUnit: number;     // alias
  finalPrice: number;    // backward compatibility
  applied: boolean;
  discountRate: number;
  originalLine: number;
  linePaid: number;
};

type CartTotals = { subtotal: number; discountTotal: number; grandTotal: number };

function round2(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}
function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    const items: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return bad("No items");

    let subtotal = 0;
    let discountTotal = 0;

    const out: CartItemOut[] = [];

    for (const it of items) {
      const q = Math.max(1, Number(it.quantity || 1));
      const unit = Number(it.unitPrice || 0);
      const pct = await activeDiscountPctForSlugServer(it.slug);
      const { finalPrice, applied } = calcDiscountedUnitPrice(unit, pct);

      const lineTotal = round2(unit * q);
      const linePaid = round2(finalPrice * q);

      subtotal += lineTotal;
      discountTotal += lineTotal - linePaid;

      out.push({
        slug: it.slug,
        quantity: q,
        unitPrice: unit,
        finalUnit: finalPrice,
        finalPrice,
        applied,
        discountRate: pct,
        originalLine: lineTotal,
        linePaid,
      });
    }

    const totals: CartTotals = {
      subtotal,
      discountTotal,
      grandTotal: round2(subtotal - discountTotal),
    };

    return NextResponse.json({ ok: true, items: out, totals });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e) },
      { status: 500 }
    );
  }
}
