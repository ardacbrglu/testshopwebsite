// src/app/api/checkout/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { randomUUID, createHmac } from "crypto";
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice, getProductCodeFromMap } from "@/lib/attribution";

async function getProductBySlug(slug) {
  const rows = await query(
    "SELECT id, slug, name, description, price, imageUrl, product_code, isActive FROM products WHERE slug=? LIMIT 1",
    [slug]
  );
  return rows.length ? rows[0] : null;
}

function parseForm(body) {
  const slug = body.get("slug");
  const qty = Math.max(1, parseInt(body.get("qty") || "1", 10));
  return { slug, qty };
}

function hmac(ts, raw, key) {
  return createHmac("sha256", key).update(`${ts}.${raw}`).digest("hex");
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const { slug, qty } = parseForm(form);
    if (!slug) return NextResponse.json({ ok: false, error: "missing slug" }, { status: 400 });

    const product = await getProductBySlug(slug);
    if (!product || !product.isActive) {
      return NextResponse.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const attrib = getAttribution();
    const disc = calcDiscountedUnitPrice(product.price, attrib, product.slug);

    const unit = product.price;            // kuruş
    const unitAfter = disc.finalPrice;     // kuruş
    const quantity = qty;

    const line = unit * quantity;
    const lineAfter = unitAfter * quantity;
    const discountTotal = line - lineAfter;

    // Sipariş kaydı
    const orderNumber = "ORD-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const ins = await query(
      "INSERT INTO orders (order_number, total_amount, discount_total) VALUES (?,?,?)",
      [orderNumber, lineAfter, discountTotal]
    );
    const orderId = ins.insertId;

    await query(
      `INSERT INTO order_items
       (order_id, product_id, product_slug, product_name, product_code, quantity, unit_price, unit_price_after_discount)
       VALUES (?,?,?,?,?,?,?,?)`,
      [orderId, product.id, product.slug, product.name, product.product_code, quantity, unit, unitAfter]
    );

    // İndirim yoksa Cabo'ya bildirim gönderme (senin kuralın)
    if (!disc.applied || discountTotal <= 0 || !attrib) {
      return NextResponse.redirect(new URL(`/orders?ok=1&ord=${orderNumber}`, req.url));
    }

    // Map'teki product_code ile DB'deki eşleşiyor mu? (savunma amaçlı)
    const mapCode = getProductCodeFromMap(product.slug);
    if (mapCode && mapCode !== product.product_code) {
      // İstersen burada "code mismatch" log'u atabilirsin
    }

    // ---- Cabo'ya satış bildirimi ----
    const payloadItem = {
      productCode: product.product_code,
      productSlug: product.slug,
      name: product.name,
      quantity,
      unitPrice: unit,
      unitPriceAfterDiscount: unitAfter
    };

    if ((process.env.CABO_USE_PRODUCT_IDS || "0") === "1") {
      payloadItem.productId = String(product.id);
    }

    const payload = {
      version: 1,
      requestId: randomUUID(),
      order: {
        orderId: String(orderId),
        orderNumber,
        totalAmount: lineAfter,   // kuruş
        discountTotal,            // kuruş
        createdAt: new Date().toISOString(),
        items: [payloadItem]
      },
      referral: {
        token: attrib.ref,
        linkId: attrib.lid,
        scope: attrib.scope
      }
    };

    const raw = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    const key = process.env.CABO_HMAC_SECRET;
    const keyId = process.env.CABO_KEY_ID;
    const sig = hmac(ts, raw, key);

    await fetch(process.env.CABO_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cabo-timestamp": ts,
        "x-cabo-key-id": keyId,
        "x-cabo-signature": `v1=${sig}`,
        "x-request-id": payload.requestId,
        "cache-control": "no-store"
      },
      body: raw
    }).catch(() => {});

    return NextResponse.redirect(new URL(`/orders?ok=1&ord=${orderNumber}`, req.url));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "server-error" }, { status: 500 });
  }
}
