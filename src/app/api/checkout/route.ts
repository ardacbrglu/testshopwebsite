export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, withTransaction } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/cart";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { activeDiscountPctForSlugServer, productCodeForSlug } from "@/lib/attribution";
import { sendCaboWebhook, type CaboItem } from "@/lib/cabo";

interface CartEmailRow { email: string | null; }

interface CheckoutItemRow {
  id: number;
  quantity: number;
  productId: number;
  slug: string;
  name: string;
  price: number;        // kuruş
  product_code: string; // DB alanı
}

interface ComputedLine {
  it: CheckoutItemRow;
  pct: number;
  unit: number;
  unitAfter: number;
  qty: number;
  lineGross: number;
  lineNet: number;
}

interface TxResult {
  orderNumber: string;
  orderId: number;
  total: number;
  discount_total: number;
  email: string;
  computed: ComputedLine[];
}

const SCOPE: "sitewide" | "landing" =
  (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase() as "sitewide" | "landing";

function makeOrderNumber(): string {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const cartId = await getOrCreateCartId();

  const cartRows = (await query("SELECT email FROM carts WHERE id = ?", [cartId])) as unknown as CartEmailRow[];
  const email = (body.email || cartRows[0]?.email || "").trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Önce geçerli e-posta girip kaydedin." }, { status: 400 });
  }

  const itemsDb = (await query(
    `SELECT ci.id, ci.quantity,
            p.id as productId, p.slug, p.name, p.price, p.product_code
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?`,
    [cartId]
  )) as unknown as CheckoutItemRow[];

  if (!itemsDb?.length) {
    return NextResponse.json({ error: "Sepet boş." }, { status: 400 });
  }

  const store = await cookies();
  const wid = store.get("cabo_wid")?.value || null; // ref token
  const lid = store.get("cabo_lid")?.value || null;

  // İndirim yüzdeleri ve MAP kodları
  const [discountPcts, mapCodes] = await Promise.all([
    Promise.all(itemsDb.map((it: CheckoutItemRow) => activeDiscountPctForSlugServer(it.slug))),
    Promise.all(itemsDb.map((it: CheckoutItemRow) => Promise.resolve(productCodeForSlug(it.slug)))),
  ]);

  const result: TxResult = await withTransaction(async (conn: PoolConnection) => {
    const orderNumber = makeOrderNumber();

    let gross = 0;
    let discountTotal = 0;

    const computed: ComputedLine[] = itemsDb.map((it: CheckoutItemRow, idx: number) => {
      const pct = discountPcts[idx] ?? 0;
      const unit = Number(it.price);
      const unitAfter = pct > 0 ? unit - Math.round(unit * (pct / 100)) : unit;

      const qty = Number(it.quantity);
      const lineGross = unit * qty;
      const lineNet   = unitAfter * qty;

      gross += lineGross;
      discountTotal += (lineGross - lineNet);

      return { it, pct, unit, unitAfter, qty, lineGross, lineNet };
    });

    const netTotal = gross - discountTotal;

    // orders
    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO orders (order_number, email, total_amount, discount_total) VALUES (?, ?, ?, ?)",
      [orderNumber, email, netTotal, discountTotal]
    );
    const orderId = res.insertId;

    // order_items
    for (const c of computed) {
      await conn.execute(
        `INSERT INTO order_items
         (order_id, product_id, product_slug, product_name, product_code, quantity, unit_price, unit_price_after_discount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          c.it.productId,
          c.it.slug,
          c.it.name,
          c.it.product_code,
          c.qty,
          c.unit,
          c.unitAfter,
        ]
      );
    }

    // sepeti temizle + e-posta güncelle
    await conn.execute("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
    await conn.execute("UPDATE carts SET email = ? WHERE id = ?", [email, cartId]);

    return {
      orderNumber,
      orderId,
      total: netTotal,
      discount_total: discountTotal,
      email,
      computed,
    } as TxResult;
  });

  // --- Cabo S2S webhook (debug log’lu) ---
  try {
    if (!wid) {
      console.warn("[CABO WEBHOOK] skip: wid(token) yok");
    } else {
      const caboItemsOrNull: Array<CaboItem | null> = result.computed
        .map((c: ComputedLine) => {
          const idx = itemsDb.findIndex((row: CheckoutItemRow) => row.productId === c.it.productId);
          const code = mapCodes[idx];
          const pct = c.pct;

          if (!code) return null;                       // anlaşmalı değil
          if (SCOPE === "landing" && pct <= 0) return null; // landing: sadece indirimli

          return {
            productCode: code,
            productId: c.it.productId,
            productSlug: c.it.slug,
            quantity: c.qty,
            unitPriceCharged: c.unitAfter,
            lineTotal: c.unitAfter * c.qty,
          } satisfies CaboItem;
        });

      const caboItems = caboItemsOrNull.filter(
        (item: CaboItem | null): item is CaboItem => item !== null
      );

      if (caboItems.length === 0) {
        console.warn("[CABO WEBHOOK] skip: gönderilecek item yok (scope=%s)", SCOPE);
      } else {
        console.log("[CABO WEBHOOK] sending", caboItems.length, "item(s) | scope:", SCOPE);
        await sendCaboWebhook({
          keyId: process.env.CABO_KEY_ID || "UNKNOWN",
          event: "purchase",
          orderNumber: result.orderNumber,
          email: result.email,
          totalAmount: result.total,
          discountTotal: result.discount_total,
          items: caboItems,
          caboRef: wid,
        });
      }
    }
  } catch (e) {
    console.error("[CABO WEBHOOK] error:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    orderNumber: result.orderNumber,
    orderId: result.orderId,
    total: result.total,
    caboRef: wid,
    lid,
  });
}
