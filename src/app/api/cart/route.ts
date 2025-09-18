export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getOrCreateCart, getCartIdOptional, attachEmailToCart } from "@/lib/cart";
import { absoluteFromReq } from "@/lib/urls";

type CartItemRow = {
  cart_item_id: number; product_id: number; slug: string; name: string;
  price: number; imageUrl: string; quantity: number;
};

function parseIntSafe(v: FormDataEntryValue | null, def: number, min = 1) {
  const n = parseInt((v ?? "").toString(), 10);
  if (!Number.isFinite(n) || n < min) return def;
  return n;
}
function isEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

async function hydrateCart(cartId: number): Promise<CartItemRow[]> {
  return (await query(
    `SELECT ci.id AS cart_item_id, ci.product_id, p.slug, p.name, p.price, p.imageUrl, ci.quantity
     FROM cart_items ci JOIN products p ON p.id=ci.product_id
     WHERE ci.cart_id=? ORDER BY ci.id DESC`, [cartId]
  )) as CartItemRow[];
}

export async function GET() {
  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ items: [], email: null });
  const cart = await query("SELECT email FROM carts WHERE id=? LIMIT 1", [cartId]);
  const items = await hydrateCart(cartId);
  return NextResponse.json({ items, email: cart[0]?.email || null });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const action = (form.get("action") || "add").toString();
    const { id: cartId } = await getOrCreateCart();

    if (action === "set-email") {
      const email = (form.get("email") || "").toString().trim();
      if (!email || !isEmail(email)) {
        return NextResponse.redirect(absoluteFromReq(req, "/cart?err=invalid_email"));
      }
      await attachEmailToCart(cartId, email);
      return NextResponse.redirect(absoluteFromReq(req, "/cart?email=1"));
    }

    if (action === "add") {
      const slug = (form.get("slug") || "").toString().trim();
      const qty  = parseIntSafe(form.get("qty"), 1, 1);
      if (!slug) return NextResponse.redirect(absoluteFromReq(req, "/products?err=missing_slug"));

      const prod = await query("SELECT id FROM products WHERE slug=? AND isActive=1 LIMIT 1", [slug]);
      if (!prod.length) return NextResponse.redirect(absoluteFromReq(req, "/products?err=notfound"));

      const pid = Number(prod[0].id);
      const ex  = await query("SELECT id,quantity FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1", [cartId, pid]);
      if (ex.length) {
        await query("UPDATE cart_items SET quantity=? WHERE id=?", [Number(ex[0].quantity)+qty, ex[0].id]);
      } else {
        await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)", [cartId, pid, qty]);
      }
      return NextResponse.redirect(absoluteFromReq(req, "/cart?added=1"));
    }

    if (action === "update") {
      const itemId = parseIntSafe(form.get("cart_item_id"), 0, 1);
      const qty    = parseIntSafe(form.get("qty"), 1, 1);
      if (!itemId) return NextResponse.redirect(absoluteFromReq(req, "/cart?err=missing_item"));
      await query("UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?", [qty, itemId, cartId]);
      return NextResponse.redirect(absoluteFromReq(req, "/cart?updated=1"));
    }

    if (action === "remove") {
      const itemId = parseIntSafe(form.get("cart_item_id"), 0, 1);
      if (!itemId) return NextResponse.redirect(absoluteFromReq(req, "/cart?err=missing_item"));
      await query("DELETE FROM cart_items WHERE id=? AND cart_id=?", [itemId, cartId]);
      return NextResponse.redirect(absoluteFromReq(req, "/cart?removed=1"));
    }

    if (action === "clear") {
      await query("DELETE FROM cart_items WHERE cart_id=?", [cartId]);
      return NextResponse.redirect(absoluteFromReq(req, "/cart?cleared=1"));
    }

    return NextResponse.redirect(absoluteFromReq(req, "/cart?err=unknown_action"));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server-error";
    return NextResponse.json({ ok:false, error: msg }, { status:500 });
  }
}
