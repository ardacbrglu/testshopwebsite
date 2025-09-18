// src/app/api/checkout/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { randomUUID, createHmac } from "crypto";
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";
import { getCartIdOptional } from "@/lib/cart";

function signHmac(ts, raw, key) {
  return createHmac("sha256", key).update(`${ts}.${raw}`).digest("hex");
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const fromCart = form.get("fromCart")?.toString() === "1";
    if (!fromCart) return NextResponse.json({ ok:false, error:"use cart checkout" }, { status:400 });

    const cartId = await getCartIdOptional();
    if (!cartId) return NextResponse.json({ ok:false, error:"empty cart" }, { status:400 });

    const cartRow = await query("SELECT email FROM carts WHERE id=? LIMIT 1", [cartId]);
    const email = cartRow[0]?.email || null;
    if (!email) return NextResponse.json({ ok:false, error:"email required" }, { status:400 });

    const items = await query(
      `SELECT ci.product_id, p.slug, p.name, p.price, p.product_code, ci.quantity
       FROM cart_items ci JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=?`, [cartId]
    );
    if (!items.length) return NextResponse.json({ ok:false, error:"empty cart" }, { status:400 });

    const attrib = await getAttribution();

    let totalAfter=0, discountTotal=0;
    const orderItems = items.map(it=>{
      const d = calcDiscountedUnitPrice(it.price, attrib, it.slug);
      const line = it.price*it.quantity, after = d.finalPrice*it.quantity;
      totalAfter += after; discountTotal += (line-after);
      return {
        productId: String(it.product_id),
        productCode: it.product_code,
        productSlug: it.slug,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.price,
        unitPriceAfterDiscount: d.finalPrice
      };
    });

    const orderNumber = "ORD-"+Date.now()+"-"+Math.floor(Math.random()*1000);
    const ins = await query(
      "INSERT INTO orders (order_number, email, total_amount, discount_total) VALUES (?,?,?,?)",
      [orderNumber, email, totalAfter, discountTotal]
    );
    const orderId = ins.insertId;

    for (const it of orderItems) {
      await query(
        `INSERT INTO order_items
         (order_id, product_id, product_slug, product_name, product_code, quantity, unit_price, unit_price_after_discount)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, it.productId, it.productSlug, it.name, it.productCode, it.quantity, it.unitPrice, it.unitPriceAfterDiscount]
      );
    }

    if (discountTotal > 0 && attrib) {
      const payload = {
        version: 1,
        requestId: randomUUID(),
        order: {
          orderId: String(orderId),
          orderNumber,
          totalAmount: totalAfter,
          discountTotal,
          email,
          createdAt: new Date().toISOString(),
          items: orderItems
        },
        referral: { token: attrib.ref, linkId: attrib.lid, scope: attrib.scope }
      };
      const raw = JSON.stringify(payload);
      const ts = Math.floor(Date.now()/1000).toString();
      const sig = signHmac(ts, raw, process.env.CABO_HMAC_SECRET);
      await fetch(process.env.CABO_WEBHOOK_URL, {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "x-cabo-timestamp":ts,
          "x-cabo-key-id":process.env.CABO_KEY_ID,
          "x-cabo-signature":`v1=${sig}`,
          "x-request-id":payload.requestId,
          "cache-control":"no-store"
        },
        body: raw
      }).catch(()=>{});
    }

    await query("DELETE FROM cart_items WHERE cart_id=?", [cartId]);
    return NextResponse.redirect(`/orders?ok=1&ord=${orderNumber}`);
  } catch (e) {
    return NextResponse.json({ ok:false, error: (e?.message || "server-error") }, { status:500 });
  }
}
