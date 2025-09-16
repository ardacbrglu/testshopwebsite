import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { uid } from "@/lib/format";
import { getBySlug, getProductCode } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CABO_WEBHOOK_URL = process.env.CABO_WEBHOOK_URL;
const KEY_ID = process.env.CABO_KEY_ID || "";
const HMAC_SECRET = process.env.CABO_HMAC_SECRET || "";
const REQUIRE_PRODUCT_CODE = String(process.env.REQUIRE_PRODUCT_CODE || "0") === "1";

function sign(ts, raw) {
  return crypto.createHmac("sha256", HMAC_SECRET).update(`${ts}.${raw}`).digest("hex");
}

export async function POST(req) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ ok: false, error: "empty_cart" }, { status: 400 });
    }

    // [CABO-INTEGRATION] Ref cookie → indirim görünürlüğü tetikleyicisi
    const c = await cookies();
    const caboRef = c.get("cabo_ref")?.value || c.get("caboRef")?.value || null;
    const applyDiscounts = !!caboRef;

    // Katalogtan fiyatları (ref varsa indirimli birim fiyat) oku
    const normalized = items
      .map((it) => {
        const p = getBySlug(it.slug, { applyDiscounts });
        const qty = Math.max(1, Math.floor(it.quantity || 1));
        if (!p) return null;
        const unit = p.unitFinal ?? p.price;
        return {
          letter: p.id,
          slug: p.slug,
          name: p.name,
          quantity: qty,
          unitPrice: unit, // TRY
          contracted: p.contracted,
          productCode: getProductCode(p.id),
          lineTotal: Math.round(unit * qty * 100) / 100, // TRY
        };
      })
      .filter(Boolean);

    const contractedItems = normalized.filter(
      (n) => n.contracted && (!REQUIRE_PRODUCT_CODE || n.productCode)
    );

    const orderTotal = normalized.reduce((s, n) => s + n.lineTotal, 0);
    const orderNumber = uid("ORD");

    // Sipariş objesini (Orders sayfası için) geriye döneceğiz
    const orderForClient = {
      id: orderNumber,
      orderNumber,
      createdAt: new Date().toISOString(),
      totalAmount: Math.round(orderTotal * 100) / 100,
      items: normalized.map((n) => ({
        id: n.slug,
        name: n.name,
        quantity: n.quantity,
        priceAtPurchase: n.unitPrice, // TRY birim
      })),
    };

    // S2S postback (sadece contracted ürün varsa ve ENV tam ise)
    let caboResponse = null;
    if (contractedItems.length > 0 && CABO_WEBHOOK_URL && KEY_ID && HMAC_SECRET) {
      const payload = {
        orderNumber,
        status: "confirmed", // [CABO-INTEGRATION]
        caboRef: caboRef || undefined,
        items: contractedItems.map((n) => ({
          productCode: n.productCode || undefined,
          productSlug: n.slug,
          quantity: n.quantity,
          unitPriceCharged: n.unitPrice, // TRY
          lineTotal: n.lineTotal,        // TRY
        })),
      };

      const raw = JSON.stringify(payload);
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = sign(ts, raw);

      const res = await fetch(CABO_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // [CABO-INTEGRATION] HMAC header seti
          "X-Cabo-Key-Id": KEY_ID,
          "X-Key-Id": KEY_ID,
          "X-Cabo-Timestamp": ts,
          "X-Timestamp": ts,
          "X-Cabo-Signature": sig,
          "X-Signature": sig,
          "X-Request-Id": orderNumber,
          "X-Idempotency-Key": orderNumber,
        },
        body: raw,
        cache: "no-store",
      });

      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      caboResponse = { status: res.status, data: parsed };
    }

    return NextResponse.json(
      {
        ok: true,
        orderNumber,
        order: orderForClient, // [CABO-INTEGRATION] Orders sayfası için detay
        summary: {
          total: Math.round(orderTotal * 100) / 100,
          itemCount: normalized.reduce((s, n) => s + n.quantity, 0),
        },
        cabo: caboResponse || { skipped: true, reason: "no_contracted_items_or_missing_env" },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
