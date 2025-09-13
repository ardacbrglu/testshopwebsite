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

function parseJSON(str, fallback) { try { return JSON.parse(str || ""); } catch { return fallback; } }
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
  try {
    const token = (await cookies()).get("auth_token")?.value;
    if(!token) return null;
    return await verifyAuthToken(token);
  } catch { return null; }
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
    const discountMap = parseJSON(process.env.CABO_DISCOUNTS_JSON, {});
    const codeMap = parseJSON(process.env.CABO_PRODUCT_CODES_JSON, {});
    const currency = process.env.SHOP_CURRENCY || "TRY";

    let total = 0;
    const orderItems = [];

    for(const it of data.items){
      const p = products.find(x=>x.id===it.productId);
      if(!p) continue;
      const unit = hasRef ? applyDiscount(p.price, discountMap[p.slug]).price : p.price;
      const line = +(unit * it.quantity).toFixed(2);
      total = +(total + line).toFixed(2);
      orderItems.push({ productId: p.id, quantity: it.quantity, priceAtPurchase: unit, slug: p.slug, lineTotal: line });
    }
    if(orderItems.length===0) return NextResponse.json({ error:"Geçersiz sepet." }, { status:400 });

    const orderNumber = "ORD-" + randomUUID().slice(0,8).toUpperCase();

    // DB kaydı
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

    // Cabo webhook (opsiyonel ama tavsiye)
    if (process.env.CABO_WEBHOOK_URL && process.env.CABO_HMAC_SECRET && process.env.CABO_KEY_ID) {
      const payload = {
        // yeni alan adları
        orderNumber: order.orderNumber,
        caboRef,
        status: "confirmed",
        items: orderItems.map(oi => ({
          productCode: codeMap[oi.slug] || null,
          quantity: oi.quantity,
          lineTotal: oi.lineTotal,
        })),
        // geriye uyumluluk için ek alanlar:
        orderId: order.orderNumber,
        token: caboRef,
        products: orderItems.map(oi => ({
          productCode: codeMap[oi.slug] || null,
          quantity: oi.quantity,
          amount: oi.lineTotal,      // eski şema "amount" bekliyorsa
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
          method:"POST",
          headers:{
            "Content-Type":"application/json",

            // yeni header isimleri (katı sürüm)
            "X-Key-Id": process.env.CABO_KEY_ID,
            "X-Timestamp": ts,
            "X-Signature": sig,
            "X-Request-Id": reqId,
            "X-Nonce": nonce,

            // eski header isimleri (geriye uyumluluk)
            "X-Cabo-Key-Id": process.env.CABO_KEY_ID,
            "X-Cabo-Timestamp": ts,
            "X-Cabo-Signature": sig,
          },
          body: raw,
        }).catch(() => {});
      }catch{
        // webhook başarısız olsa bile sipariş oluşturuldu; kullanıcıyı bloke etmeyelim
      }
    }

    return NextResponse.json({ ok:true, orderNumber: order.orderNumber });
  }catch(err){
    return NextResponse.json({ error:"İşlem hatası." }, { status:400 });
  }
}
