// src/app/api/orders/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface OrderRow {
  id: number;
  order_number: string;
  total_amount: number;
  discount_total: number;
  created_at: string;
}

interface OrderItemRow {
  order_id: number;
  product_slug: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_price_before: number;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("email") || "").trim();
  if (!email) {
    return NextResponse.json({ error: "E-posta gerekli" }, { status: 400 });
  }

  const orders = (await query(
    "SELECT id, order_number, total_amount, discount_total, created_at FROM orders WHERE email = ? ORDER BY id DESC",
    [email]
  )) as unknown as OrderRow[];

  const ids = orders.map((o) => o.id);
  const itemsByOrder = new Map<number, OrderItemRow[]>();

  if (ids.length) {
    const rows = (await query(
      `SELECT order_id, product_slug, product_name, quantity,
              unit_price_after_discount AS unit_price, unit_price AS unit_price_before
       FROM order_items
       WHERE order_id IN (${ids.map(() => "?").join(",")})
       ORDER BY id ASC`,
      ids
    )) as unknown as OrderItemRow[];

    for (const r of rows) {
      const arr = itemsByOrder.get(r.order_id) || [];
      arr.push(r);
      itemsByOrder.set(r.order_id, arr);
    }
  }

  const payload = orders.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    createdAt: o.created_at,
    totalAmount: o.total_amount,
    discountTotal: o.discount_total,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return NextResponse.json({ email, orders: payload }, { headers: { "Cache-Control": "no-store" } });
}
