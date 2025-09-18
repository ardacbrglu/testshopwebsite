export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getOrCreateCart, getCartIdOptional, attachEmailToCart } from "@/lib/cart";

type CartItemRow = {
  cart_item_id: number; product_id: number; slug: string; name: string;
  price: number; imageUrl: string; quantity: number;
};

function wantsHtml(req: Request) {
  return (req.headers.get("accept") || "").includes("text/html");
}
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
     WHERE ci.cart_id=? ORDER BY ci.id DESC`,
    [cartId]
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
    const html = wantsHtml(req);
    const { id: cartId } = await getOrCreateCart();

    if (action === "set-email") {
      const email = (form.get("email") || "").toString().trim();
      if (!email || !isEmail(email)) {
        return html
          ? NextResponse.redirect(new URL("/cart?err=invalid_email", req.url))
          : NextResponse.json({ ok:false, error:"invalid email" }, { status:400 });
      }
      await attachEmailToCart(cartId, email);
      return html ? NextResponse.redirect(new URL("/cart?ok=1", req.url))
                  : NextResponse.json({ ok:true });
    }

    if (action === "add") {
      const slug = (form.get("slug") || "").toString().trim();
      const qty  = parseIntSafe(form.get("qty"), 1, 1);
      if (!slug) {
        return html
          ? NextResponse.redirect(new URL("/products?err=missing_slug", req.url))
          : NextResponse.json({ ok:false, error:"missing slug" }, { status:400 });
      }
      const prod = await query("SELECT id FROM products WHERE slug=? AND isActive=1 LIMIT 1", [slug]);
      if (!prod.length) {
        return html
          ? NextResponse.redirect(new URL("/products?err=notfound", req.url))
          : NextResponse.json({ ok:false, error:"product not found" }, { status:404 });
      }
      const pid = Number(prod[0].id);
      const exists = await query("SELECT id,quantity FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1", [cartId, pid]);
      if (exists.length) {
        await query("UPDATE cart_items SET quantity=? WHERE id=?", [Number(exists[0].quantity)+qty, exists[0].id]);
      } else {
        await query("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?,?,?)", [cartId, pid, qty]);
      }
      return html ? NextResponse.redirect(new URL("/cart", req.url))
                  : NextResponse.json({ ok:true, items: await hydrateCart(cartId) });
    }

    if (action === "update") {
      const itemId = parseIntSafe(form.get("cart_item_id"), 0, 1);
      const qty    = parseIntSafe(form.get("qty"), 1, 1);
      if (!itemId) {
        return html
          ? NextResponse.redirect(new URL("/cart?err=missing_item", req.url))
          : NextResponse.json({ ok:false, error:"missing cart_item_id" }, { status:400 });
      }
      await query("UPDATE cart_items SET quantity=? WHERE id=? AND cart_id=?", [qty, itemId, cartId]);
      return html ? NextResponse.redirect(new URL("/cart", req.url))
                  : NextResponse.json({ ok:true, items: await hydrateCart(cartId) });
    }

    if (action === "remove") {
      const itemId = parseIntSafe(form.get("cart_item_id"), 0, 1);
      if (!itemId) {
        return html
          ? NextResponse.redirect(new URL("/cart?err=missing_item", req.url))
          : NextResponse.json({ ok:false, error:"missing cart_item_id" }, { status:400 });
      }
      await query("DELETE FROM cart_items WHERE id=? AND cart_id=?", [itemId, cartId]);
      return html ? NextResponse.redirect(new URL("/cart", req.url))
                  : NextResponse.json({ ok:true, items: await hydrateCart(cartId) });
    }

    if (action === "clear") {
      await query("DELETE FROM cart_items WHERE cart_id=?", [cartId]);
      return html ? NextResponse.redirect(new URL("/cart", req.url))
                  : NextResponse.json({ ok:true, items: [] });
    }

    return html
      ? NextResponse.redirect(new URL("/cart?err=unknown_action", req.url))
      : NextResponse.json({ ok:false, error:"unknown action" }, { status:400 });
  } catch (e: unknown) {
    const msg = (e instanceof Error) ? e.message : "server-error";
    return NextResponse.json({ ok:false, error: msg }, { status:500 });
  }
}
