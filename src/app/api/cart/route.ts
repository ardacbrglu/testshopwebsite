// src/app/api/cart/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrCreateCartId, getCartIdOptional } from "@/lib/cart";
import { query } from "@/lib/db";

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

  // implicit any uyarısını önlemek için toplama döngüsü
  let total: number = 0;
  for (const it of items) {
    total += Number(it.price) * Number(it.quantity);
  }

  return NextResponse.json(
    { cartId, email: cartRow?.email ?? null, items, total },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/cart
export async function POST(req: Request) {
  const { productId, quantity = 1 } = (await req.json()) as { productId: number; quantity?: number };
  if (!productId || Number(quantity) <= 0) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const cartId = await getOrCreateCartId();

  const [p]: any[] = await query("SELECT id FROM products WHERE id = ? AND isActive = 1", [productId]);
  if (!p) return NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });

  const [existing]: any[] = await query(
    "SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?",
    [cartId, productId]
  );

  if (existing) {
    await query("UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?", [
      Number(existing.quantity) + Number(quantity),
      existing.id,
      cartId,
    ]);
  } else {
    await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)", [
      cartId,
      productId,
      Number(quantity),
    ]);
  }

  return NextResponse.json({ ok: true, cartId });
}

// PUT /api/cart
export async function PUT(req: Request) {
  const { itemId, productId, quantity } = (await req.json()) as {
    itemId?: number;
    productId?: number;
    quantity: number;
  };
  const cartId = await getOrCreateCartId();
  if (!quantity || Number(quantity) <= 0) {
    return NextResponse.json({ error: "Miktar ≥ 1 olmalı" }, { status: 400 });
  }

  if (itemId) {
    await query("UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?", [Number(quantity), itemId, cartId]);
    return NextResponse.json({ ok: true });
  }

  if (productId) {
    await query("UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?", [
      Number(quantity),
      cartId,
      productId,
    ]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "itemId veya productId gerekli" }, { status: 400 });
}

// PATCH /api/cart  → email kaydet
export async function PATCH(req: Request) {
  const { email } = (await req.json()) as { email: string };
  const cartId = await getOrCreateCartId();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin" }, { status: 400 });
    }
  await query("UPDATE carts SET email = ? WHERE id = ?", [email, cartId]);

  const [c]: any[] = await query("SELECT id FROM customers WHERE email = ?", [email]);
  if (!c) await query("INSERT INTO customers (email) VALUES (?)", [email]);

  return NextResponse.json({ ok: true, cartId, email });
}

// DELETE /api/cart
export async function DELETE(req: Request) {
  const { itemId, productId } = (await req.json()) as { itemId?: number; productId?: number };
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
