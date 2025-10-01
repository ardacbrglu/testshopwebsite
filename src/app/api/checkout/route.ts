// src/app/api/checkout/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Checkout API — sitewide indirim uygula + Cabo'ya HMAC'li webhook
 *
 * Body:
 * {
 *   email: "buyer@example.com",
 *   currency: "TRY",
 *   items: [{ slug: "product-a", quantity: 2, unitPrice: 199.9 }]
 * }
 *
 * Webhook (Cabo):
 * - İndirimi uygulanmış satırlar gönderilir.
 * - Her satırda product_code + product_id + slug + quantity + linePaid bulunur.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  activeDiscountPctForSlugServer,
  calcDiscountedUnitPrice,
  productCodeForSlug,
  productIdForSlug,
  getLinkIdOrNull,
} from "@/lib/attribution";

type ReqItem = { slug: string; quantity: number; unitPrice: number };

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}
function round2(n: number) { return Math.max(0, Math.round(n * 100) / 100); }
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ENV ${name}`);
  return v;
}
function hmacSHA256(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email: string = String(body?.email || "").trim().toLowerCase();
    const currency: string = String(body?.currency || "TRY");
    const items: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
    if (!email) return bad("Email is required");
    if (!items.length) return bad("No items");

    const orderId = "ord_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const linkId = await getLinkIdOrNull();

    let subtotal = 0;
    let discountTotal = 0;

    const lines: Array<{
      slug: string;
      quantity: number;
      unitPrice: number;
      discountRate: number;
      originalUnit: number;
      finalUnit: number;
      lineTotal: number;
      linePaid: number;
      product_code?: string;
      product_id?: string | number;
      applied: boolean;
    }> = [];

    for (const it of items) {
      const q = Math.max(1, Number(it.quantity || 1));
      const unit = Number(it.unitPrice || 0);
      const pct = await activeDiscountPctForSlugServer(it.slug);
      const { finalPrice, applied } = calcDiscountedUnitPrice(unit, pct);

      const lineTotal = round2(unit * q);
      const linePaid  = round2(finalPrice * q);

      subtotal += lineTotal;
      discountTotal += lineTotal - linePaid;

      const product_code = productCodeForSlug(it.slug) || undefined;
      const product_id   = productIdForSlug(it.slug) ?? undefined;

      lines.push({
        slug: it.slug,
        quantity: q,
        unitPrice: unit,
        discountRate: pct,
        originalUnit: unit,
        finalUnit: finalPrice,
        lineTotal,
        linePaid,
        applied,
        ...(product_code ? { product_code } : {}),
        ...(product_id !== undefined ? { product_id } : {}),
      });
    }

    const grandTotal = round2(subtotal - discountTotal);

    // Cabo'ya sadece indirimli satırlar ve LID varsa gönder
    const eligible = lines.filter((l) => l.applied && (l.discountRate || 0) > 0);
    if (linkId && eligible.length) {
      const payload = {
        orderNumber: orderId,
        caboRef: String(linkId), // eski sistem token yerine LID geçiyoruz (Cabo tarafı LID'le eşler)
        items: eligible.map((l) => ({
          productCode: l.product_code,
          productId: l.product_id,
          productSlug: l.slug,
          quantity: l.quantity,
          unitPriceCharged: l.finalUnit,
          lineTotal: l.linePaid,
        })),
        totals: { subtotal, discountTotal, grandTotal },
      };

      const KEY_ID = requireEnv("CABO_KEY_ID");
      const SECRET = requireEnv("CABO_HMAC_SECRET");
      const URL = requireEnv("CABO_WEBHOOK_URL");
      const tsSec = Math.floor(Date.now() / 1000); // endpoint epoch seconds bekliyor
      const raw = JSON.stringify(payload);
      const sig = "sha256=" + hmacSHA256(SECRET, `${tsSec}.${raw}`);

      await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cabo-Key-Id": KEY_ID,
          "X-Cabo-Timestamp": String(tsSec),
          "X-Cabo-Signature": sig,
          "Cache-Control": "no-store",
        },
        body: raw,
      }).catch(() => { /* gözlemle */ });
    }

    return NextResponse.json({
      ok: true,
      orderId,
      totals: { subtotal, discountTotal, grandTotal },
      items: lines.map((l) => ({
        slug: l.slug,
        quantity: l.quantity,
        unitPrice: l.originalUnit,
        discountRate: l.discountRate,
        finalUnit: l.finalUnit,
        originalLine: l.lineTotal,
        paid: l.linePaid,
        applied: l.applied,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Checkout failed" }, { status: 500 });
  }
}
