// src/app/api/cart/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrCreateCartId, getCartIdOptional } from "@/lib/cart";
import { query } from "@/lib/db";
import { activeDiscountPctForSlugServer } from "@/lib/attribution";

/* ----------------------------- types ----------------------------- */
type Body = Record<string, unknown>;

interface IdRow { id: number }
interface CartEmailRow { email: string | null }

interface CartJoinRow {
  id: number;
  productId: number;
  quantity: number;
  name: string;
  slug: string;
  price: number;         // kuruş
  imageUrl: string;
  product_code: string;
}

/* ------------------------- helpers (body) ------------------------- */
async function readBody(req: Request): Promise<Body> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { const j = await req.json(); return (j && typeof j === "object") ? (j as Body) : {}; }
    catch { return {}; }
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    try { const fd = await req.formData(); const obj: Body = {}; fd.forEach((v,k)=>obj[k]=v); return obj; }
    catch { /* fallthrough */ }
  }
  try {
    const txt = await req.text();
    if (!txt) return {};
    try { const j = JSON.parse(txt) as unknown; return (j && typeof j === "object") ? (j as Body) : {}; }
    catch {
      const p = new URLSearchParams(txt); const obj: Body = {};
      for (const [k,v] of p.entries()) obj[k]=v; return obj;
    }
  } catch { return {}; }
}

async function resolveProductId(body: Body): Promise<number | null> {
  const pid = body.productId ?? body.productID ?? body.pid;
  if (pid != null) return Number(pid);
  const slug = body.slug;
  if (typeof slug === "string" && slug) {
    const rows = (await query("SELECT id FROM products WHERE slug = ? LIMIT 1", [slug])) as unknown as IdRow[];
    const row = rows[0]; if (row?.id) return Number(row.id);
  }
  return null;
}

function normalizeQty(v: unknown, fallback = 1): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/* ------------------------------ handlers ------------------------------ */

// GET /api/cart  → indirimleri de hesaplar, özet verir
export async function GET() {
  const cartId = await getOrCreateCartId();

  const itemsDb = (await query(
    `SELECT ci.id,
            ci.product_id AS productId,
            ci.quantity,
            p.name, p.slug, p.price, p.imageUrl, p.product_code
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?`,
    [cartId]
  )) as unknown as CartJoinRow[];

  const discountPcts = await Promise.all(
    itemsDb.map((it) => activeDiscountPctForSlugServer(it.slug))
  );

  let gross = 0;
  let discountTotal = 0;

  const items = itemsDb.map((it, idx) => {
    const pct = discountPcts[idx] ?? 0;
    const unit = Number(it.price);
    const unitAfter = pct > 0 ? unit - Math.round(unit * (pct / 100)) : unit;

    const lineGross = unit * Number(it.quantity);
    const lineNet   = unitAfter * Number(it.quantity);
    const lineDisc  = lineGross - lineNet;

    gross += lineGross;
    discountTotal += lineDisc;

    return {
      id: it.id,
      productId: it.productId,
      quantity: it.quantity,
      slug: it.slug,
      name: it.name,
      imageUrl: it.imageUrl,
      product_code: it.product_code,

      unitPrice: unit,
      discountPct: pct,
      unitPriceAfter: unitAfter,

      lineGross,
      lineDiscount: lineDisc,
      lineNet,
    };
  });

  const net = gross - discountTotal;

  const cartRows = (await query("SELECT email FROM carts WHERE id = ?", [cartId])) as unknown as CartEmailRow[];
  const email = cartRows[0]?.email ?? null;

  return NextResponse.json(
    {
      cartId,
      email,
      items,
      totals: { gross, discountTotal, net },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/cart  → ekle
export async function POST(req: Request) {
  const body = await readBody(req);
  const quantity = normalizeQty(body.quantity ?? body.qty ?? 1);
  const productId = await resolveProductId(body);
  if (!productId) return NextResponse.json({ error: "Ürün bilgisi eksik (productId/slug)" }, { status: 400 });

  const cartId = await getOrCreateCartId();
  const prod = (await query("SELECT id FROM products WHERE id=? AND isActive=1", [productId])) as unknown as IdRow[];
  if (!prod[0]) return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });

  const exists = (await query(
    "SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=?",
    [cartId, productId]
  )) as unknown as { id: number; quantity: number }[];

  if (exists[0]) {
    await query("UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?", [
      Number(exists[0].quantity) + quantity, exists[0].id, cartId,
    ]);
  } else {
    await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)", [
      cartId, productId, quantity,
    ]);
  }

  return NextResponse.json({ ok: true, cartId });
}

// PUT /api/cart  → miktar güncelle
export async function PUT(req: Request) {
  const body = await readBody(req);
  const cartId = await getOrCreateCartId();

  const quantity = normalizeQty(body.quantity, 1);
  if (!quantity) return NextResponse.json({ error: "Miktar ≥ 1 olmalı" }, { status: 400 });

  const itemId = body.itemId != null ? Number(body.itemId) : undefined;
  const productId = body.productId != null ? Number(body.productId) : undefined;

  if (itemId) {
    await query("UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?", [quantity, itemId, cartId]);
    return NextResponse.json({ ok: true });
  }
  if (productId) {
    await query("UPDATE cart_items SET quantity=? WHERE cart_id=? AND product_id=?", [quantity, cartId, productId]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "itemId veya productId gerekli" }, { status: 400 });
}

// PATCH /api/cart  → email kaydet
export async function PATCH(req: Request) {
  const body = await readBody(req);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const cartId = await getOrCreateCartId();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin" }, { status: 400 });
  }
  await query("UPDATE carts SET email=? WHERE id=?", [email, cartId]);
  const c = (await query("SELECT id FROM customers WHERE email=? LIMIT 1", [email])) as unknown as IdRow[];
  if (!c[0]) await query("INSERT INTO customers (email) VALUES (?)", [email]);
  return NextResponse.json({ ok: true, cartId, email });
}

// DELETE /api/cart  → satır sil / tümünü temizle
export async function DELETE(req: Request) {
  const body = await readBody(req);
  const itemId = body.itemId != null ? Number(body.itemId) : undefined;
  const productId = body.productId != null ? Number(body.productId) : undefined;

  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok: true });

  if (itemId) {
    await query("DELETE FROM cart_items WHERE id=? AND cart_id=?", [itemId, cartId]);
    return NextResponse.json({ ok: true });
  }
  if (productId) {
    await query("DELETE FROM cart_items WHERE cart_id=? AND product_id=?", [cartId, productId]);
    return NextResponse.json({ ok: true });
  }
  await query("DELETE FROM cart_items WHERE cart_id=?", [cartId]);
  return NextResponse.json({ ok: true });
}
