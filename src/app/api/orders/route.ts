// src/app/api/orders/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  // Son 100 sipariş başlıkları (itemlar ayrı endpoint gerekirse eklenir)
  const rows = await query(
    `SELECT id, order_number, email, total_amount, discount_total, created_at AS createdAt
     FROM orders
     ORDER BY id DESC
     LIMIT 100`
  );
  return NextResponse.json({ items: rows });
}
