// app/api/checkout/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";
import { randomUUID } from "crypto";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ItemSchema = z.object({ productId: z.string(), quantity: z.number().int().min(1).max(999) });
const BodySchema = z.object({ items: z.array(ItemSchema).min(1) });

function parseJSON(s, fb) { try { return JSON.parse(s || ""); } catch { return fb; } }
function shortKey(slug = "") {
  return slug.replace(/^product-/, "").replace(/^urun-/, "").replace(/^item-/, "");
}
function pick(map, keys = []) {
  for (const k of keys) if (k && Object.prototype.hasOwnProperty.call(map, k)) return map[k];
  return undefined;
}
function applyDiscount(price, spec) {
  if (!spec) return { price, originalPrice: null };
  const s = String(spec).trim().toUpperCase();
  if (s.endsWith("%")) {
    const pct = Math.max(0, Math.min(100, parseFloat(s.slice(0, -1)) || 0));
    const dp = +(price * (1 - pct / 100)).toFixed(2);
    return { price: dp, originalPrice: price };
  }
  const fixed = parseFloat(s.replace("TRY", "").replace("TL", "")) || 0;
  const dp = Math.max(0, +(price - fixed).toFixed(2));
  return { price: dp, originalPrice: price };
}

async function getUser(){
  try{
    const token = (await cookies()).get("auth_token")?.value;
    if(!token) return null;
    return await verifyAuthToken(token);
  }catch{ return null; }
}

export async function POST(req){
  try{
    const user = await getUser();
    if(!user) return NextResponse.json({ error:"Auth gerekli." }, { status:401 });

    const data = BodySchema.parse(await req.json());
    const ids = data.items.map(i=>i.productId);

    const products = await prisma.product.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id:true, slug:true, price:true },
    });
    if(products.length===0) return NextResponse.json({ error:"Ürün bulunamadı." }, { status:400 });

    const caboRef = (await cookies()).get("cabo_ref")?.value || null;
    const hasRef = !!caboRef;
    const discMap = parseJSON(process.env.CABO_DISCOUNTS_JSON, {});
    const codeMap = parseJSON(process.env.CABO_PRODUCT_CODES_JSON, {});
    const currency = process.env.SHOP_CURRENCY || "TRY";

    let total = 0;
    const orderItems = [];

    for (const it of data.items) {
      const p = products.find(x => x.id === it.productId);
      if (!p) continue;
      const spec = pick(discMap, [p.slug, shortKey(p.slug), p.id]);
      const { price: unit } = hasRef ? applyDiscount(p.price, spec) : { price: p.price, originalPrice: null };
      const line = +(unit * it.quantity).toFixed(2);
      total = +(total + line).toFixed(2);
      orderItems.push({ productId: p.id, slug: p.slug, quantity: it.quantity, priceAtPurchase: unit, lineTotal: line });
    }
    if(orderItems.length===0) return NextResponse.json({ error:"Geçersiz sepet." }, { status:400 });

    const orderNumber = "ORD-" + randomUUID().slice(0,8).toUpperCase();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        totalAmount: total,
        orderItems: {
          createMany: {
            data: orderItems.map(oi => ({
              productId: oi.productId,
              quantity: oi.quantity,
              priceAtPurchase: oi.priceAtPurchase,
            })),
          }
        }
      },
      include: { orderItems: true },
    });

    // Cabo webhook (HMAC)
    if (process.env.CABO_WEBHOOK_URL && process.env.CABO_HMAC_SECRET && process.env.CABO_KEY_ID) {
      const payload = {
        orderNumber: order.orderNumber,
        caboRef,
        status: "confirmed",
        items: orderItems.map(oi => ({
          productCode: pick(codeMap, [oi.slug, shortKey(oi.slug), oi.productId]) || null,
          quantity: oi.quantity,
          lineTotal: oi.lineTotal,
        })),
        // geri uyum için:
        orderId: order.orderNumber,
        token: caboRef,
        products: orderItems.map(oi => ({
          productCode: pick(codeMap, [oi.slug, shortKey(oi.slug), oi.productId]) || null,
          quantity: oi.quantity,
          amount: oi.lineTotal,
          currency,
        })),
      };

      try{
        const raw = JSON.stringify(payload);
        const ts = Math.floor(Date.now()/1000).toString();
        const sig = crypto.createHmac("sha256", process.env.CABO_HMAC_SECRET).update(`${ts}.${raw}`).digest("hex");
        const reqId = randomUUID();
        const nonce = randomUUID();

        await fetch(process.env.CABO_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // yeni
            "X-Key-Id": process.env.CABO_KEY_ID,
            "X-Timestamp": ts,
            "X-Signature": sig,
            "X-Request-Id": reqId,
            "X-Nonce": nonce,
            // eski
            "X-Cabo-Key-Id": process.env.CABO_KEY_ID,
            "X-Cabo-Timestamp": ts,
            "X-Cabo-Signature": sig,
          },
          body: raw,
        }).catch(()=>{});
      }catch{}
    }

    return NextResponse.json({ ok:true, orderNumber: order.orderNumber });
  }catch(err){
    return NextResponse.json({ error:"İşlem hatası." }, { status:400 });
  }
}
