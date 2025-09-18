// src/app/api/cart/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getOrCreateCart, getCartIdOptional, attachEmailToCart } from "@/lib/cart";

async function hydrateCart(cartId:number) {
  const items = await query(
    `SELECT ci.id as cart_item_id, ci.product_id, p.slug, p.name, p.price, p.imageUrl, ci.quantity
     FROM cart_items ci JOIN products p ON p.id=ci.product_id
     WHERE ci.cart_id=? ORDER BY ci.id DESC`, [cartId]
  );
  return items;
}

export async function GET() {
  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ items: [], email: null });
  const cart = await query("SELECT email FROM carts WHERE id=? LIMIT 1", [cartId]);
  const items = await hydrateCart(cartId);
  return NextResponse.json({ items, email: cart[0]?.email || null });
}

export async function POST(req:Request) {
  const form = await req.formData();
  const action = (form.get("action") || "add").toString();
  const slug = form.get("slug")?.toString();
  const qty = Math.max(1, parseInt((form.get("qty") || "1").toString(), 10));
  const email = form.get("email")?.toString() || null;

  const { id:cartId } = await getOrCreateCart();

  if (action === "set-email") {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ ok:false, error:"invalid email" }, { status:400 });
    await attachEmailToCart(cartId, email);
    const items = await hydrateCart(cartId);
    return NextResponse.json({ ok:true, items, email });
  }

  if (action === "add") {
    const rows = await query("SELECT id FROM products WHERE slug=? AND isActive=1 LIMIT 1", [slug]);
    if (!rows.length) return NextResponse.json({ ok:false, error:"product not found" }, { status:404 });
    const pid = rows[0].id;
    // varsa artır, yoksa ekle
    const existing = await query("SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1", [cartId, pid]);
    if (existing.length) {
      await query("UPDATE cart_items SET quantity=? WHERE id=?", [existing[0].quantity + qty, existing[0].id]);
    } else {
      await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)", [cartId, pid, qty]);
    }
    const items = await hydrateCart(cartId);
    return NextResponse.json({ ok:true, items });
  }

  if (action === "update") {
    const itemId = parseInt((form.get("cart_item_id")||"0").toString(),10);
    if (!itemId) return NextResponse.json({ ok:false, error:"missing cart_item_id" }, { status:400 });
    await query("UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?", [qty, itemId, cartId]);
    const items = await hydrateCart(cartId);
    return NextResponse.json({ ok:true, items });
  }

  if (action === "remove") {
    const itemId = parseInt((form.get("cart_item_id")||"0").toString(),10);
    if (!itemId) return NextResponse.json({ ok:false, error:"missing cart_item_id" }, { status:400 });
    await query("DELETE FROM cart_items WHERE id=? AND cart_id=?", [itemId, cartId]);
    const items = await hydrateCart(cartId);
    return NextResponse.json({ ok:true, items });
  }

  if (action === "clear") {
    await query("DELETE FROM cart_items WHERE cart_id=?", [cartId]);
    return NextResponse.json({ ok:true, items: [] });
  }

  return NextResponse.json({ ok:false, error:"unknown action" }, { status:400 });
}
