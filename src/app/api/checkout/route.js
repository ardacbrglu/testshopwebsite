// src/app/api/checkout/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Güvenlik Notları:
 * - Tüm para birimleri INT (kuruş/TL) olarak işlenir, ondalık yok.
 * - İndirim yalnızca imzalı HttpOnly "cabo_attrib" çerezi varsa uygulanır.
 * - Satış bildirimi (merchant -> Cabo) HMAC-SHA256 ile imzalanır.
 * - Yalnızca indirim uygulanmış siparişlerde post yapılır (aksi halde komisyon yok).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, createHmac } from "crypto";
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";

async function getProductBySlug(slug) {
  const rows = await query(
    "SELECT id, slug, name, description, price, imageUrl, product_code, isActive FROM products WHERE slug=? LIMIT 1",
    [slug]
  );
  return rows.length ? rows[0] : null;
}

function parseForm(body) {
  // form-urlencoded POST
  const slug = body.get("slug");
  const qty = Math.max(1, parseInt(body.get("qty") || "1", 10));
  return { slug, qty };
}

function signHmac(timestamp, rawBody, key) {
  const data = `${timestamp}.${rawBody}`;
  return createHmac("sha256", key).update(data).digest("hex");
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

    // Attribution / indirim
    const attrib = getAttribution();
    const d = calcDiscountedUnitPrice(product.price, attrib, product.slug);

    const unitPrice = product.price;                 // INT
    const unitPriceAfter = d.finalPrice;             // INT
    const quantity = qty;

    const lineTotal = unitPrice * quantity;
    const lineTotalAfter = unitPriceAfter * quantity;
    const discountTotal = lineTotal - lineTotalAfter;

    // Sipariş yaz
    const orderNumber = "ORD-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const result = await query(
      "INSERT INTO orders (order_number, total_amount, discount_total) VALUES (?,?,?)",
      [orderNumber, lineTotalAfter, discountTotal]
    );

    const orderId = result.insertId;
    await query(
      `INSERT INTO order_items 
       (order_id, product_id, product_slug, product_name, product_code, quantity, unit_price, unit_price_after_discount)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        orderId,
        String(product.id),
        product.slug,
        product.name,
        product.product_code,
        quantity,
        unitPrice,
        unitPriceAfter,
      ]
    );

    // İndirim uygulanmadıysa Cabo'ya post etme (komisyon yok)
    if (!d.applied || discountTotal <= 0 || !attrib) {
      return NextResponse.redirect(new URL(`/orders?ok=1&ord=${orderNumber}`, req.url));
    }

    // ---- Cabo'ya satış bildirimi ----
    const payload = {
      version: 1,
      requestId: randomUUID(),
      order: {
        orderId: String(orderId),
        orderNumber,
        totalAmount: lineTotalAfter,   // INT
        discountTotal,                 // INT
        createdAt: new Date().toISOString(),
        items: [
          {
            productId: String(product.id),
            productCode: product.product_code,
            productSlug: product.slug,
            name: product.name,
            quantity,
            unitPrice: unitPrice,
            unitPriceAfterDiscount: unitPriceAfter,
          },
        ],
      },
      referral: {
        token: attrib.ref,
        linkId: attrib.lid,
        scope: attrib.scope,           // sitewide | single
      },
    };

    const raw = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    const keyId = process.env.CABO_KEY_ID;
    const key = process.env.CABO_MERCHANT_KEY;

    const sig = signHmac(ts, raw, key);

    const res = await fetch(process.env.CABO_CALLBACK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cabo-timestamp": ts,
        "x-cabo-key-id": keyId,
        "x-cabo-signature": `v1=${sig}`,
        "x-request-id": payload.requestId,
        "cache-control": "no-store",
      },
      body: raw,
    });

    // Cabo idempotent çalışır; 2xx değilse bile siparişi yerelde tamamlıyoruz
    if (!res.ok) {
      // Loglamak istersen buraya console.error(res.status)
    }

    return NextResponse.redirect(new URL(`/orders?ok=1&ord=${orderNumber}`, req.url));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "server-error" }, { status: 500 });
  }
}
