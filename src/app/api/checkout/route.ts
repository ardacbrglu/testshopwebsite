// src/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { query } from "@/lib/db";
import {
  activeDiscountPctForSlugServer,
  calcDiscountedUnitPrice,
  productCodeForSlug,
} from "@/lib/attribution";

const COOKIE_NAME = "cart_id";

type ItemRow = {
  id: number;
  product_id: number;
  quantity: number;
  slug: string;
  name: string;
  price: number; // kuruş (indirimsiz)
};

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function envReady(): boolean {
  return (
    !!process.env.CABO_KEY_ID &&
    !!process.env.CABO_HMAC_SECRET &&
    !!process.env.CABO_WEBHOOK_URL
  );
}

function orderNumber(): string {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function getCartId(): Promise<number | null> {
  const c = await cookies();
  const v = c.get(COOKIE_NAME)?.value;
  return v && Number.isFinite(Number(v)) ? Number(v) : null;
}

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email: string };
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return noStore(NextResponse.json({ error: "Geçerli e-posta gerekli" }, { status: 400 }));
    }

    const cartId = await getCartId();
    if (!cartId) {
      return noStore(NextResponse.json({ error: "Sepet bulunamadı" }, { status: 400 }));
    }

    // sepeti çek
    const rows = (await query(
      `SELECT ci.id, ci.product_id, ci.quantity, p.slug, p.name, p.price
       FROM cart_items ci
       JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=?
       ORDER BY ci.id ASC`,
      [cartId]
    )) as ItemRow[];

    if (!rows.length) {
      return noStore(NextResponse.json({ error: "Sepet boş" }, { status: 400 }));
    }

    // indirim (sadece webhook mümkünse >0)
    const enriched = [];
    for (const it of rows) {
      const pct = await activeDiscountPctForSlugServer(it.slug);
      const { finalPrice, applied } = calcDiscountedUnitPrice(Number(it.price), pct);
      enriched.push({
        ...it,
        discountPct: applied ? pct : 0,
        unitAfter: finalPrice,
        lineTotal: finalPrice * it.quantity,
      });
    }

    const total = enriched.reduce((a, x) => a + x.lineTotal, 0);
    const discountTotal = enriched.reduce(
      (a, x) => a + (x.price - x.unitAfter) * x.quantity,
      0
    );

    // order kaydı
    const on = orderNumber();
    const ins = await query(
      "INSERT INTO orders (order_number, email, total_amount, discount_total) VALUES (?, ?, ?, ?)",
      [on, email, total, discountTotal]
    );
    const orderId = (ins as unknown as { insertId: number }).insertId;

    // order_items
    for (const it of enriched) {
      await query(
        `INSERT INTO order_items
         (order_id, product_id, product_slug, product_name, product_code, quantity, unit_price, unit_price_after_discount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          it.product_id,
          it.slug,
          it.name,
          productCodeForSlug(it.slug) || "",
          it.quantity,
          it.price,
          it.unitAfter,
        ]
      );
    }

    // Sepeti boşalt
    await query("DELETE FROM cart_items WHERE cart_id=?", [cartId]);

    // ------- Cabo'ya POST (yalnızca env ve wid varsa + map code varsa) -------
    const store = await cookies();
    const wid = store.get("cabo_wid")?.value || "";
    const lid = store.get("cabo_lid")?.value || "";

    const webhook = {
      attempted: false as boolean,
      sent: false as boolean,
      items: 0 as number,
      status: 0 as number,
      url: process.env.CABO_WEBHOOK_URL || "",
    };

    if (envReady() && wid) {
      const postItems = enriched
        .filter((x) => x.discountPct > 0 && productCodeForSlug(x.slug))
        .map((x) => ({
          productCode: productCodeForSlug(x.slug) as string,
          productId: x.product_id,
          productSlug: x.slug,
          quantity: x.quantity,
          unitPriceCharged: x.unitAfter,
          lineTotal: x.lineTotal,
        }));

      if (postItems.length > 0) {
        webhook.attempted = true;
        const payload = JSON.stringify({
          orderNumber: on,
          caboRef: wid,
          lid: lid || null,
          items: postItems,
        });

        const ts = Math.floor(Date.now() / 1000);
        const sig = crypto
          .createHmac("sha256", process.env.CABO_HMAC_SECRET as string)
          .update(`${ts}.${payload}`)
          .digest("hex");

        try {
          const resp = await fetch(process.env.CABO_WEBHOOK_URL as string, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Cabo-Key-Id": process.env.CABO_KEY_ID as string,
              "X-Cabo-Timestamp": String(ts),
              "X-Cabo-Signature": sig,
            },
            body: payload,
          });
          webhook.status = resp.status;
          webhook.sent = resp.ok;
        } catch (_e) {
          webhook.sent = false;
        }
        webhook.items = postItems.length;
      }
    }

    return noStore(
      NextResponse.json({
        ok: true,
        orderNumber: on,
        orderId,
        total,
        caboRef: wid || null,
        lid: lid || null,
        webhook,
      })
    );
  } catch (_e) {
    return noStore(NextResponse.json({ error: "Checkout başarısız" }, { status: 500 }));
  }
}
