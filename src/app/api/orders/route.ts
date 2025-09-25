// src/app/api/orders/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface OrderRow { id:number; orderNumber:string|null; totalAmount:number; webhookOk:0|1|null; createdAt?: Date; }

export async function GET() {
  const rows = await query(
    "SELECT id, orderNumber, totalAmount, webhookOk, createdAt FROM orders ORDER BY id DESC LIMIT 50"
  ) as OrderRow[];
  return NextResponse.json({ ok:true, orders: rows });
}
