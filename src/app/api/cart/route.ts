export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";
import { getOrCreateCart, getCartIdOptional } from "@/lib/cart";

/** Yardımcı */
async function loadCartLines(cartId: number) {
  const rows = await query(
    `SELECT ci.productId, ci.quantity, p.slug, p.name, p.price, p.isActive
       FROM cart_items ci
       JOIN products p ON p.id = ci.productId
      WHERE ci.cartId = ?`,
    [cartId]
  );

  const attrib = await getAttribution();

  let subtotal = 0, totalAfter = 0;
  const lines = rows.map((r: any) => {
    const unit = Number(r.price); // kuruş
    const d = calcDiscountedUnitPrice(unit, attrib, r.slug);
    const unitAfter = d.finalPrice;
    const lineTotal = unitAfter * Number(r.quantity);
    subtotal += unit * Number(r.quantity);
    totalAfter += lineTotal;
    return {
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      qty: Number(r.quantity),
      unit,                        // kuruş
      unitAfter,                   // kuruş
      applies: !!d.applied,
      discountPct: d.discountPct,  // 0..90
      lineTotal,                   // kuruş
    };
  });

  const discountTotal = subtotal - totalAfter;
  return { lines, subtotal, totalAfter, discountTotal };
}

function isJson(req: NextRequest) {
  return (req.headers.get("content-type") || "").includes("application/json");
}

export async function GET() {
  const cart = await getOrCreateCart();
  const data = await loadCartLines(cart.id);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  // Form POST (Ürün sayfasından) + JSON POST (isteğe bağlı)
  let action = "add";
  let slug = "";
  let qty = 1;

  if (isJson(req)) {
    const body = await req.json().catch(() => ({}));
    action = body.action || "add";
    slug = String(body.slug || "");
    qty = Math.max(1, parseInt(String(body.qty || "1"), 10));
  } else {
    try {
      const fd = await req.formData();
      action = String(fd.get("action") || "add");
      slug = String(fd.get("slug") || "");
      qty = Math.max(1, parseInt(String(fd.get("qty") || "1"), 10));
    } catch {
      // x-www-form-urlencoded fallback
      const text = await req.text();
      const sp = new URLSearchParams(text);
      action = sp.get("action") || "add";
      slug = sp.get("slug") || "";
      qty = Math.max(1, parseInt(sp.get("qty") || "1", 10));
    }
  }

  if (action !== "add" || !slug) {
    return NextResponse.json({ ok: false, message: "Geçersiz istek" }, { status: 400 });
  }

  const cart = await getOrCreateCart();

  // Ürün bulunur mu?
  const rows = await query(
    "SELECT id, isActive FROM products WHERE slug=? LIMIT 1",
    [slug]
  );
  if (!rows.length || !rows[0].isActive) {
    return NextResponse.json({ ok: false, message: "Ürün bulunamadı/aktif değil" }, { status: 404 });
  }
  const pid = Number(rows[0].id);

  // Satır varsa arttır, yoksa ekle
  await query(
    `INSERT INTO cart_items (cartId, productId, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [cart.id, pid, qty]
  );

  // Form gönderimleri için /cart’a yönlendir
  if (!isJson(req)) {
    return NextResponse.redirect(new URL("/cart", req.url));
  }

  // JSON çağrıları için mevcut durumu döndür
  const data = await loadCartLines(cart.id);
  return NextResponse.json({ ok: true, ...data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { slug, productId, quantity } = body;
  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok: false, message: "Sepet yok" }, { status: 400 });

  const qty = Math.max(1, parseInt(String(quantity || "1"), 10));
  let pid = Number(productId || 0);

  if (!pid && slug) {
    const rows = await query("SELECT id FROM products WHERE slug=? LIMIT 1", [slug]);
    if (rows.length) pid = Number(rows[0].id);
  }
  if (!pid) return NextResponse.json({ ok: false, message: "Ürün bulunamadı" }, { status: 404 });

  await query(
    "UPDATE cart_items SET quantity=? WHERE cartId=? AND productId=?",
    [qty, cartId, pid]
  );

  const data = await loadCartLines(cartId);
  return NextResponse.json({ ok: true, ...data });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { slug, productId } = body;
  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok: false, message: "Sepet yok" }, { status: 400 });

  let pid = Number(productId || 0);
  if (!pid && slug) {
    const rows = await query("SELECT id FROM products WHERE slug=? LIMIT 1", [slug]);
    if (rows.length) pid = Number(rows[0].id);
  }
  if (!pid) return NextResponse.json({ ok: false, message: "Ürün bulunamadı" }, { status: 404 });

  await query("DELETE FROM cart_items WHERE cartId=? AND productId=?", [cartId, pid]);
  const data = await loadCartLines(cartId);
  return NextResponse.json({ ok: true, ...data });
}
