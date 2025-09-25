export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, withTransaction } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/cart";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { activeDiscountPctForSlugServer, productCodeForSlug } from "@/lib/attribution";
import { sendCaboWebhook } from "@/lib/cabo";

interface CartEmailRow { email: string | null; }
interface CheckoutItemRow {
  id: number; quantity: number;
  productId: number; slug: string; name: string; price: number; product_code: string;
}

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

  const items = (await query(
    `SELECT ci.id, ci.quantity,
            p.id as productId, p.slug, p.name, p.price, p.product_code
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?`,
    [cartId]
  )) as unknown as CheckoutItemRow[];

  if (!items?.length) {
    return NextResponse.json({ error: "Sepet boş." }, { status: 400 });
  }

  // wid/lid ve indirim yüzdelerini önceden çöz
  const store = await cookies();
  const wid = store.get("cabo_wid")?.value;
  const lid = store.get("cabo_lid")?.value;

  const discountPcts: number[] = await Promise.all(
    items.map((it) => activeDiscountPctForSlugServer(it.slug))
  );

  const result = await withTransaction(async (conn: PoolConnection) => {
    const orderNumber = makeOrderNumber();

    let gross = 0;
    let discountTotal = 0;

    // hesaplamaları yap ve order_items için değerleri hazırla
    const computed = items.map((it, idx) => {
      const pct = discountPcts[idx] ?? 0;
      const unit = Number(it.price);
      const unitAfter = pct > 0 ? unit - Math.round(unit * (pct / 100)) : unit;

      const lineGross = unit * Number(it.quantity);
      const lineNet   = unitAfter * Number(it.quantity);

      gross += lineGross;
      discountTotal += (lineGross - lineNet);

      return { it, unit, unitAfter };
    });

    const netTotal = gross - discountTotal;

    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO orders (order_number, email, total_amount, discount_total) VALUES (?, ?, ?, ?)",
      [orderNumber, email, netTotal, discountTotal]
    );
    const orderId = res.insertId;

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
          Number(c.it.quantity),
          c.unit,
          c.unitAfter,
        ]
      );
    }

    await conn.execute("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
    await conn.execute("UPDATE carts SET email = ? WHERE id = ?", [email, cartId]);

    return { orderNumber, orderId, total: netTotal, discount_total: discountTotal, email };
  });

  // Cabo postback
  try {
    const caboItems = items
      .map((it) => ({
        code: productCodeForSlug(it.slug) || it.product_code,
        quantity: Number(it.quantity),
        unit_price: Number(it.price),
      }))
      .filter((x) => !!x.code);

    await sendCaboWebhook({
      keyId: process.env.CABO_KEY_ID || "UNKNOWN",
      event: "purchase",
      orderNumber: result.orderNumber,
      email,
      totalAmount: result.total,
      discountTotal: result.discount_total,
      items: caboItems,
      wid,
      lid,
    });
  } catch { /* sessiz geç */ }

  return NextResponse.json({ ok: true, ...result });
}
