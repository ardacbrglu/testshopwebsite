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
    const products = await prisma.product.findMany({ where: { id: { in: ids }, isActive: true } });
    if(products.length===0) return NextResponse.json({ error:"Ürün bulunamadı." }, { status:400 });

    let total = 0;
    const orderItems = [];
    for(const it of data.items){
      const p = products.find(x=>x.id===it.productId);
      if(!p) continue;
      const line = p.price * it.quantity;
      total += line;
      orderItems.push({ productId: p.id, quantity: it.quantity, priceAtPurchase: p.price });
    }
    if(orderItems.length===0) return NextResponse.json({ error:"Geçersiz sepet." }, { status:400 });

    const orderNumber = "ORD-" + randomUUID().slice(0,8).toUpperCase();
    const order = await prisma.order.create({
      data: { orderNumber, userId: user.id, totalAmount: total, orderItems: { createMany: { data: orderItems } } },
      include: { orderItems: true },
    });

    // (Opsiyonel) Cabo webhook
    if (process.env.CABO_WEBHOOK_URL && process.env.CABO_HMAC_SECRET) {
      const payload = {
        orderNumber: order.orderNumber,
        userId: user.id,
        totalAmount: order.totalAmount,
        items: order.orderItems.map(oi => ({
          productId: oi.productId, quantity: oi.quantity,
          unitPrice: oi.priceAtPurchase, lineTotal: oi.priceAtPurchase * oi.quantity
        })),
      };
      try{
        const raw = JSON.stringify(payload);
        const ts = Math.floor(Date.now()/1000).toString();
        const sig = crypto.createHmac("sha256", process.env.CABO_HMAC_SECRET).update(`${ts}.${raw}`).digest("hex");
        await fetch(process.env.CABO_WEBHOOK_URL, {
          method:"POST",
          headers:{ "Content-Type":"application/json", "X-Cabo-Timestamp": ts, "X-Cabo-Signature": sig, "X-Cabo-Key-Id": process.env.CABO_KEY_ID || "demo" },
          body: raw,
        }).catch(()=>{});
      }catch{}
    }

    return NextResponse.json({ ok:true, orderNumber: order.orderNumber });
  }catch{
    return NextResponse.json({ error:"İşlem hatası." }, { status:400 });
  }
}
