// src/app/api/cart/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrCreateCartId, getCartIdOptional } from "@/lib/cart";
import { query } from "@/lib/db";

/* ----------------------------- helpers ----------------------------- */

// Tüm içerik tiplerini destekleyen gövde okuyucu:
// - application/json
// - application/x-www-form-urlencoded
// - multipart/form-data
// - düz querystring/text (fallback)
async function readBody(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get("content-type") || "";

  // JSON
  if (ct.includes("application/json")) {
    try {
      const json = await req.json();
      return (json && typeof json === "object") ? json : {};
    } catch {
      return {};
    }
  }

  // Form-data & URL-encoded
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      return Object.fromEntries(fd.entries());
    } catch {
      // dev: bazı ortamlar urlencoded'ı text olarak bırakabilir → alttaki fallback çalışır
    }
  }

  // Fallback: text → önce JSON dene, olmazsa querystring gibi çöz
  try {
    const txt = await req.text();
    if (!txt) return {};
    try {
      const json = JSON.parse(txt);
      return (json && typeof json === "object") ? json : {};
    } catch {
      const params = new URLSearchParams(txt);
      const obj: Record<string, any> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      return obj;
    }
  } catch {
    return {};
  }
}

async function resolveProductId(body: Record<string, any>): Promise<number | null> {
  // Öncelik: productId → yoksa slug → DB’den id bul
  if (body.productId) return Number(body.productId);
  if (body.slug) {
    const [row]: any[] = await query("SELECT id FROM products WHERE slug = ? LIMIT 1", [String(body.slug)]);
    if (row?.id) return Number(row.id);
  }
  return null;
}

function normalizeQty(v: any, fallback = 1): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/* ------------------------------ handlers ------------------------------ */

// GET /api/cart
export async function GET() {
  const cartId = await getOrCreateCartId();

  const items = (await query(
    `SELECT ci.id,
            ci.product_id AS productId,
            ci.quantity,
            p.name, p.slug, p.price, p.imageUrl, p.product_code
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?`,
    [cartId]
  )) as any[];

  const [cartRow]: any[] = await query("SELECT email FROM carts WHERE id = ?", [cartId]);

  let total = 0;
  for (const it of items) total += Number(it.price) * Number(it.quantity);

  return NextResponse.json(
    { cartId, email: cartRow?.email ?? null, items, total },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/cart  → ekle (JSON veya form-encoded)
export async function POST(req: Request) {
  const body = await readBody(req);
  // Eski formlar: action=add, slug, qty
  const quantity = normalizeQty(body.quantity ?? body.qty ?? 1);
  const productId = await resolveProductId(body);

  if (!productId) {
    return NextResponse.json({ error: "Ürün bilgisi eksik (productId/slug)" }, { status: 400 });
  }

  const cartId = await getOrCreateCartId();

  // ürün var mı?
  const [p]: any[] = await query("SELECT id FROM products WHERE id = ? AND isActive = 1", [productId]);
  if (!p) return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });

  // manuel upsert (unique constraint yok)
  const [existing]: any[] = await query(
    "SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?",
    [cartId, productId]
  );

  if (existing) {
    await query("UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?", [
      Number(existing.quantity) + quantity,
      existing.id,
      cartId,
    ]);
  } else {
    await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)", [
      cartId,
      productId,
      quantity,
    ]);
  }

  return NextResponse.json({ ok: true, cartId });
}

// PUT /api/cart  → miktar güncelle
export async function PUT(req: Request) {
  const body = await readBody(req);
  const cartId = await getOrCreateCartId();

  const quantity = normalizeQty(body.quantity, 1);
  if (!quantity) {
    return NextResponse.json({ error: "Miktar ≥ 1 olmalı" }, { status: 400 });
  }

  const itemId = body.itemId ? Number(body.itemId) : undefined;
  const productId = body.productId ? Number(body.productId) : undefined;

  if (itemId) {
    await query("UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?", [quantity, itemId, cartId]);
    return NextResponse.json({ ok: true });
  }

  if (productId) {
    await query("UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?", [
      quantity,
      cartId,
      productId,
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "itemId veya productId gerekli" }, { status: 400 });
}

// PATCH /api/cart  → email kaydet (JSON veya form-encoded)
export async function PATCH(req: Request) {
  const body = await readBody(req);
  const email = String(body.email || "").trim();
  const cartId = await getOrCreateCartId();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin" }, { status: 400 });
  }

  await query("UPDATE carts SET email = ? WHERE id = ?", [email, cartId]);

  const [c]: any[] = await query("SELECT id FROM customers WHERE email = ? LIMIT 1", [email]);
  if (!c) await query("INSERT INTO customers (email) VALUES (?)", [email]);

  return NextResponse.json({ ok: true, cartId, email });
}

// DELETE /api/cart  → satır sil / tümünü temizle
export async function DELETE(req: Request) {
  const body = await readBody(req);
  const itemId = body.itemId ? Number(body.itemId) : undefined;
  const productId = body.productId ? Number(body.productId) : undefined;

  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok: true });

  if (itemId) {
    await query("DELETE FROM cart_items WHERE id = ? AND cart_id = ?", [itemId, cartId]);
    return NextResponse.json({ ok: true });
  }

  if (productId) {
    await query("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?", [cartId, productId]);
    return NextResponse.json({ ok: true });
  }

  await query("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
  return NextResponse.json({ ok: true });
}
