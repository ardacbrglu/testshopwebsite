export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCartIdOptional } from "@/lib/cart";
import { getAttribution, calcDiscountedUnitPrice, getProductCodeFromMap } from "@/lib/attribution";
import crypto from "crypto";

/** HMAC: hex( HMAC_SHA256(secret, `${ts}.${raw}`) ) */
function hmacHex(secret, ts, raw) {
  return crypto.createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`${ts}.${raw}`, "utf8")
    .digest("hex");
}

async function loadCartWithPricing(cartId) {
  const rows = await query(
    `SELECT ci.productId, ci.quantity, p.slug, p.name, p.price, p.isActive
       FROM cart_items ci
       JOIN products p ON p.id = ci.productId
      WHERE ci.cartId = ?`,
    [cartId]
  );
  const attrib = await getAttribution();

  let subtotal = 0, totalAfter = 0;
  const lines = rows.map((r) => {
    const unit = Number(r.price); // kuruş
    const d = calcDiscountedUnitPrice(unit, attrib, r.slug);
    const unitAfter = d.finalPrice;
    const lineTotal = unitAfter * Number(r.quantity);
    subtotal += unit * Number(r.quantity);
    totalAfter += lineTotal;
    return {
      productId: Number(r.productId),
      slug: r.slug,
      name: r.name,
      qty: Number(r.quantity),
      unit, unitAfter, lineTotal,
      applies: !!d.applied,
      discountPct: d.discountPct,
    };
  });

  return { lines, subtotal, totalAfter, attrib };
}

export async function POST() {
  const cartId = await getCartIdOptional();
  if (!cartId) return NextResponse.json({ ok:false, message:"Sepet bulunamadı" }, { status: 400 });

  const { lines, subtotal, totalAfter, attrib } = await loadCartWithPricing(cartId);
  if (!lines.length) return NextResponse.json({ ok:false, message:"Sepet boş" }, { status: 400 });

  // sipariş oluştur (DB)
  const ins = await query(
    `INSERT INTO orders (cartId, totalAmount, caboRef, caboScope)
     VALUES (?, ?, ?, ?)`,
    [cartId, totalAfter, attrib?.token || null, attrib?.scope || null]
  );
  const orderId = Number(ins.insertId);
  const orderNumber = `ORD-${orderId}`;

  // orderNumber’ı kaydet (opsiyonel, okunaklı)
  await query(`UPDATE orders SET orderNumber=? WHERE id=?`, [orderNumber, orderId]);

  // Kalemleri yaz
  for (const li of lines) {
    await query(
      `INSERT INTO order_items
         (orderId, productId, quantity, unitPrice, unitPriceAfter, applies)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, li.productId, li.qty, li.unit, li.unitAfter, li.applies ? 1 : 0]
    );
  }

  // Cart’ı boşalt
  await query(`DELETE FROM cart_items WHERE cartId=?`, [cartId]);

  // Cabo'ya gönderilecek kalemler (yalnız indirim uygulananlar)
  let webhookOk = false;
  try {
    const itemsForCabo = lines
      .filter((li) => li.applies)
      .map((li) => ({
        productCode: getProductCodeFromMap(li.slug),  // REQUIRE_PRODUCT_CODE=1 durumunda dolu gelecek
        productId: li.productId,
        productSlug: li.slug,
        quantity: li.qty,
        unitPriceCharged: li.unitAfter,  // kuruş
        lineTotal: li.lineTotal,         // kuruş
      }));

    if (attrib && itemsForCabo.length > 0) {
      const payload = {
        orderNumber,
        caboRef: attrib.token || null,
        items: itemsForCabo,
      };

      const raw = JSON.stringify(payload);
      const ts = Math.floor(Date.now() / 1000).toString();
      const keyId = process.env.CABO_KEY_ID || "demo";
      const secret =
        process.env[`MERCHANT_KEY_${keyId}`] ||
        process.env.CABO_SECRET || "demo_secret_change_me";
      const sig = hmacHex(secret, ts, raw);

      const url = process.env.CABO_CALLBACK_URL;
      if (!url) throw new Error("CABO_CALLBACK_URL missing");

      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cabo-key-id": keyId,
          "x-cabo-timestamp": ts,
          "x-cabo-signature": sig,
          // İdempotensi yardımcıları:
          "x-request-id": String(orderId),
          "x-idempotency-key": orderNumber,
        },
        body: raw,
      });

      webhookOk = r.ok;
    }
  } catch (e) {
    webhookOk = false;
  }

  // webhook durumunu kaydet (opsiyonel)
  await query(`UPDATE orders SET webhookOk=? WHERE id=?`, [webhookOk ? 1 : 0, orderId]);

  return NextResponse.json({
    ok: true,
    orderId,
    orderNumber,
    subtotal,
    total: totalAfter,
    webhookOk,
  });
}
