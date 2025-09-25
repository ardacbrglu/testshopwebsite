// src/app/api/checkout/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAttributionFromCookie, calcDiscountedUnitPrice, getProductCodeFromMap } from "@/lib/attribution";
import crypto from "crypto";

interface DbCartRow { productId:number; quantity:number; slug:string; name:string; price:number; isActive:0|1; }
interface LineOut {
  productId:number; slug:string; name:string; qty:number;
  unit:number; unitAfter:number; lineTotal:number; applies:boolean; discountPct:number;
}

function hmacHex(secret: string, ts: string, raw: string) {
  return crypto.createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`${ts}.${raw}`, "utf8").digest("hex");
}

async function loadCartWithPricing(req: NextRequest, cartId: number, wid?: string) {
  const rows = await query(
    `SELECT ci.productId, ci.quantity, p.slug, p.name, p.price, p.isActive
       FROM cart_items ci
       JOIN products p ON p.id = ci.productId
      WHERE ci.cartId = ?`, [cartId]
  ) as DbCartRow[];

  const attribCookie = req.cookies.get("cabo_attrib")?.value;
  const effectiveWid = wid || req.headers.get("x-cabo-window") || undefined;
  const attrib = getAttributionFromCookie(attribCookie, undefined, { wid: effectiveWid, enforceWid: true });

  let subtotal = 0, totalAfter = 0;
  const lines: LineOut[] = rows.map((r: DbCartRow) => {
    const unit = Number(r.price);
    // landing scope ise ürün bazında kontrol edilmesi için slug veriyoruz
    const d = calcDiscountedUnitPrice(unit, r.slug, { attributionCookie: attribCookie, wid: effectiveWid, enforceWid: true });
    const qty = Number(r.quantity);
    const unitAfter = d.finalPrice;
    const lineTotal = unitAfter * qty;
    subtotal += unit * qty;
    totalAfter += lineTotal;
    return { productId: r.productId, slug: r.slug, name: r.name, qty, unit, unitAfter, lineTotal, applies: d.applied, discountPct: d.discountPct };
  });

  return { lines, subtotal, totalAfter, attrib };
}

export async function POST(req: NextRequest) {
  // Body'den opsiyonel wid
  let bodyWid = "";
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    bodyWid = String(b["wid"] || "");
  }

  // cartId (session'a göre)
  const cartRow = await query("SELECT id FROM carts WHERE sessionId = ? LIMIT 1", [ (req.cookies.get("cart")?.value || "") ]) as Array<{id:number}>;
  const cartId = cartRow?.[0]?.id;
  if (!cartId) return NextResponse.json({ ok:false, message:"Sepet bulunamadı" }, { status:400 });

  const { lines, subtotal, totalAfter, attrib } = await loadCartWithPricing(req, cartId, bodyWid);
  if (!lines.length) return NextResponse.json({ ok:false, message:"Sepet boş" }, { status:400 });

  const ins = await query(
    `INSERT INTO orders (cartId, totalAmount, caboRef, caboScope)
     VALUES (?, ?, ?, ?)`,
    [cartId, totalAfter, attrib?.token || null, attrib?.scope || null]
  );
  const orderId = Number((ins as any).insertId);
  const orderNumber = `ORD-${orderId}`;
  await query(`UPDATE orders SET orderNumber=? WHERE id=?`, [orderNumber, orderId]);

  for (const li of lines) {
    await query(
      `INSERT INTO order_items
         (orderId, productId, quantity, unitPrice, unitPriceAfter, applies)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, li.productId, li.qty, li.unit, li.unitAfter, li.applies ? 1 : 0]
    );
  }
  await query(`DELETE FROM cart_items WHERE cartId=?`, [cartId]);

  // webhook (only discounted + codes + batch)
  let webhookOk = false;
  if (attrib) {
    const items = lines
      .filter(li => li.applies)
      .map(li => ({
        productCode: getProductCodeFromMap(li.slug),
        productId: li.productId,
        productSlug: li.slug,
        quantity: li.qty,
        unitPriceCharged: li.unitAfter,
        lineTotal: li.lineTotal
      }))
      .filter(it => !!it.productCode);

    if (items.length > 0) {
      try {
        const payload = { orderNumber, caboRef: attrib.token || null, items };
        const raw = JSON.stringify(payload);
        const ts = Math.floor(Date.now()/1000).toString();
        const keyId = process.env.CABO_KEY_ID || "demo";
        const secret = process.env[`MERCHANT_KEY_${keyId}`] || process.env.CABO_HMAC_SECRET || "demo_secret_change_me";
        const sig = hmacHex(secret, ts, raw);
        const url = process.env.CABO_WEBHOOK_URL;
        if (!url) throw new Error("CABO_WEBHOOK_URL missing");

        const r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-cabo-key-id": keyId,
            "x-cabo-timestamp": ts,
            "x-cabo-signature": sig,
            "x-request-id": String(orderId),
            "x-idempotency-key": orderNumber
          },
          body: raw
        });
        webhookOk = r.ok;
      } catch { webhookOk = false; }
    }
  }

  await query(`UPDATE orders SET webhookOk=? WHERE id=?`, [webhookOk ? 1 : 0, orderId]);
  return NextResponse.json({ ok:true, orderId, orderNumber, subtotal, total: totalAfter, webhookOk });
}
