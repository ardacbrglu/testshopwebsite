// src/app/api/db-dump/route.js
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const rows = await query("SELECT COUNT(*) as c FROM products", []);
    const sample = await query("SELECT slug, price, isActive FROM products ORDER BY createdAt DESC LIMIT 20");
    return new Response(
      JSON.stringify({
        database_url: process.env.DATABASE_URL,
        count: rows[0]?.c ?? 0,
        sample
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, database_url: process.env.DATABASE_URL }), { status: 500 });
  }
}
