export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCartIdOptional } from "@/lib/cart";

export async function GET() {
  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ orders: [] }, { headers: { "Cache-Control": "no-store" } });

  const orders = await query(
    `SELECT id, orderNumber, totalAmount, createdAt, caboRef, caboScope, webhookOk
       FROM orders
      WHERE cartId=?
      ORDER BY id DESC
      LIMIT 50`,
    [cartId]
  );

  if (!orders.length) return NextResponse.json({ orders: [] }, { headers: { "Cache-Control": "no-store" } });

  const ids = orders.map((o: any) => Number(o.id));
  const items = await query(
    `SELECT oi.orderId, oi.productId, oi.quantity, oi.unitPrice, oi.unitPriceAfter, oi.applies,
            p.name, p.slug
       FROM order_items oi
       JOIN products p ON p.id = oi.productId
      WHERE oi.orderId IN (${ids.map(() => "?").join(",")})
      ORDER BY oi.id ASC`,
    ids
  );

  const grouped: Record<number, any[]> = {};
  for (const it of items as any[]) {
    const k = Number(it.orderId);
    (grouped[k] ||= []).push({
      id: Number(it.productId),
      slug: it.slug,
      name: it.name,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      unitPriceAfter: Number(it.unitPriceAfter),
      applies: !!it.applies,
    });
  }

  const out = orders.map((o: any) => ({
    id: Number(o.id),
    orderNumber: o.orderNumber,
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    cabo: { token: o.caboRef || null, scope: o.caboScope || null, sent: !!o.webhookOk },
    items: grouped[Number(o.id)] || [],
  }));

  return NextResponse.json({ orders: out }, { headers: { "Cache-Control": "no-store" } });
}
