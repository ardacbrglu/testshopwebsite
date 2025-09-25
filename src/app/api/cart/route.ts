// src/app/api/cart/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { calcDiscountedUnitPrice } from "@/lib/attribution";
import { getOrCreateCart, getCartIdOptional } from "@/lib/cart";

interface DbCartRow { productId: number; quantity: number; slug: string; name: string; price: number; isActive: 0|1; }
interface CartLine {
  productId: number; slug: string; name: string; qty: number;
  unit: number; unitAfter: number; applies: boolean; discountPct: number; lineTotal: number;
}

function isJson(req: NextRequest) {
  return (req.headers.get("content-type") || "").includes("application/json");
}

async function loadCartLines(req: NextRequest, cartId: number, bodyWid?: string) {
  const rows = await query(
    `SELECT ci.productId, ci.quantity, p.slug, p.name, p.price, p.isActive
       FROM cart_items ci
       JOIN products p ON p.id = ci.productId
      WHERE ci.cartId = ?`, [cartId]
  ) as DbCartRow[];

  const wid = bodyWid || req.headers.get("x-cabo-window") || undefined;
  const attribCookie = req.cookies.get("cabo_attrib")?.value;

  let subtotal = 0, totalAfter = 0;
  const lines: CartLine[] = rows.map((r: DbCartRow) => {
    const unit = Number(r.price);
    const d = calcDiscountedUnitPrice(unit, r.slug, { attributionCookie: attribCookie, wid, enforceWid: true });
    const qty = Number(r.quantity);
    const unitAfter = d.finalPrice;
    const lineTotal = unitAfter * qty;
    subtotal += unit * qty;
    totalAfter += lineTotal;
    return {
      productId: Number(r.productId), slug: r.slug, name: r.name, qty,
      unit, unitAfter, applies: d.applied, discountPct: d.discountPct, lineTotal
    };
  });

  const discountTotal = subtotal - totalAfter;
  return { lines, subtotal, totalAfter, discountTotal };
}

export async function GET(req: NextRequest) {
  const cart = await getOrCreateCart();
  const data = await loadCartLines(req, cart.id);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  // add to cart
  let action = "add", slug = "", qty = 1, widFromBody = "";

  if (isJson(req)) {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    action = String(body["action"] || "add");
    slug = String(body["slug"] || "");
    qty = Math.max(1, parseInt(String(body["qty"] || "1"), 10));
    widFromBody = String(body["wid"] || "");
  } else {
    try {
      const fd = await req.formData();
      action = String(fd.get("action") || "add");
      slug = String(fd.get("slug") || "");
      qty = Math.max(1, parseInt(String(fd.get("qty") || "1"), 10));
      widFromBody = String(fd.get("wid") || "");
    } catch {
      const text = await req.text();
      const sp = new URLSearchParams(text);
      action = sp.get("action") || "add";
      slug = sp.get("slug") || "";
      qty = Math.max(1, parseInt(sp.get("qty") || "1", 10));
      widFromBody = sp.get("wid") || "";
    }
  }

  if (action !== "add" || !slug) return NextResponse.json({ ok: false, message: "Geçersiz istek" }, { status: 400 });

  const cart = await getOrCreateCart();
  const prod = await query("SELECT id, isActive FROM products WHERE slug=? LIMIT 1", [slug]) as Array<{id:number;isActive:0|1}>;
  if (!prod.length || prod[0].isActive !== 1) return NextResponse.json({ ok:false, message:"Ürün bulunamadı/aktif değil" }, { status:404 });

  const pid = Number(prod[0].id);
  await query(
    `INSERT INTO cart_items (cartId, productId, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [cart.id, pid, qty]
  );

  if (!isJson(req)) return NextResponse.redirect(new URL("/cart", req.url));

  const data = await loadCartLines(req, cart.id, widFromBody);
  return NextResponse.json({ ok: true, ...data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const slug = String(body["slug"] || "");
  const productId = Number(body["productId"] || 0);
  const quantity = Math.max(1, parseInt(String(body["quantity"] || "1"), 10));
  const widFromBody = String(body["wid"] || "");

  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok:false, message:"Sepet yok" }, { status:400 });

  let pid = productId;
  if (!pid && slug) {
    const r = await query("SELECT id FROM products WHERE slug=? LIMIT 1", [slug]) as Array<{id:number}>;
    if (r.length) pid = Number(r[0].id);
  }
  if (!pid) return NextResponse.json({ ok:false, message:"Ürün bulunamadı" }, { status:404 });

  await query("UPDATE cart_items SET quantity=? WHERE cartId=? AND productId=?", [quantity, cartId, pid]);
  const data = await loadCartLines(req, cartId, widFromBody);
  return NextResponse.json({ ok:true, ...data });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const slug = String(body["slug"] || "");
  const productId = Number(body["productId"] || 0);

  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok:false, message:"Sepet yok" }, { status:400 });

  let pid = productId;
  if (!pid && slug) {
    const r = await query("SELECT id FROM products WHERE slug=? LIMIT 1", [slug]) as Array<{id:number}>;
    if (r.length) pid = Number(r[0].id);
  }
  if (!pid) return NextResponse.json({ ok:false, message:"Ürün bulunamadı" }, { status:404 });

  await query("DELETE FROM cart_items WHERE cartId=? AND productId=?", [cartId, pid]);
  const data = await loadCartLines(req, cartId);
  return NextResponse.json({ ok:true, ...data });
}
