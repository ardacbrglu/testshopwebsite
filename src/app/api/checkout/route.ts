// src/app/api/checkout/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query, withTransaction } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/cart";

async function getDiscountPctFromCookie(): Promise<number> {
  const store = await cookies();
  const raw = store.get("cabo_discount_pct")?.value;
  const pct = raw ? Number(raw) : 0;
  return isFinite(pct) && pct > 0 ? Math.min(pct, 90) : 0;
}

function makeOrderNumber(): string {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string };
  const cartId = await getOrCreateCartId();

  const [cart]: any[] = await query("SELECT email FROM carts WHERE id = ?", [cartId]);
  const email = (body.email || cart?.email || "").trim();
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
  )) as any[];

  if (!items?.length) {
    return NextResponse.json({ error: "Sepet boş." }, { status: 400 });
  }

  const pct = await getDiscountPctFromCookie();

  const result = await withTransaction(async (conn: any) => {
    const orderNumber = makeOrderNumber();

    let gross = 0;
    let discountTotal = 0;

    for (const it of items) {
      const lineGross = Number(it.price) * Number(it.quantity);
      gross += lineGross;
      if (pct > 0) discountTotal += Math.round(lineGross * (pct / 100));
    }

    const netTotal = gross - discountTotal;

    const [res] = await conn.execute(
      "INSERT INTO orders (order_number, email, total_amount, discount_total) VALUES (?, ?, ?, ?)",
      [orderNumber, email, netTotal, discountTotal]
    );
    const orderId = (res?.insertId ?? null) as number;

    for (const it of items) {
      const unitPrice = Number(it.price);
      const unitPriceAfter = pct > 0 ? unitPrice - Math.round(unitPrice * (pct / 100)) : unitPrice;

      await conn.execute(
        `INSERT INTO order_items
         (order_id, product_id, product_slug, product_name, product_code, quantity, unit_price, unit_price_after_discount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, it.productId, it.slug, it.name, it.product_code, Number(it.quantity), unitPrice, unitPriceAfter]
      );
    }

    await conn.execute("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
    await conn.execute("UPDATE carts SET email = ? WHERE id = ?", [email, cartId]);

    return { orderNumber, orderId, total: netTotal, discount_total: discountTotal, email };
  });

  return NextResponse.json({ ok: true, ...result });
}
