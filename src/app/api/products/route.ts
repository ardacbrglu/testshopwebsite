// src/app/api/products/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const rows = await query(
    `SELECT id, slug, name, description, price, imageUrl, isActive
     FROM products
     WHERE isActive=1
     ORDER BY createdAt DESC`
  );
  return NextResponse.json({ items: rows });
}
