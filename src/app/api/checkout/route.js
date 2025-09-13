// app/api/checkout/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Checkout (Test Web Shop)
 * - Auth zorunlu
 * - Cabo ref cookie varsa ürün-bazlı indirim uygular
 * - CABO_PRODUCT_CODES_JSON ile (slug veya id) -> productCode eşlemesi
 * - Webhook payload'ında item.productCode gönderilir
 * - HMAC-SHA256(ts + "." + rawBody) ile imzalanır
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";
import { randomUUID } from "crypto";
import crypto from "crypto";

const ItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).max(999),
});
const BodySchema = z.object({ items: z.array(ItemSchema).min(1) });

const CABO_REF_COOKIE = "cabo_ref";

function round2(n) { return Math.round(n * 100) / 100; }

// --- Discount helpers (aynen) ---
function parseDiscountValue(v) {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v) && v >= 0) return { type: "fixed", value: v };
  const s = String(v).trim().toUpperCase();
  if (s.endsWith("%")) {
    const num = parseFloat(s.slice(0, -1));
    if (!isNaN(num) && num >= 0 && num <= 100) return { type: "percent", value: num };
  }
  if (s.endsWith("TRY")) {
    const num = parseFloat(s.replace("TRY", "").trim());
    if (!isNaN(num) && num >= 0) return { type: "fixed", value: num };
  }
  const num = parseFloat(s);
  if (!isNaN(num) && num >= 0) return { type: "fixed", value: num };
  return null;
}
function loadDiscountTable() {
  try {
    const raw = process.env.CABO_DISCOUNTS_JSON || "";
    if (!raw) return {};
    const obj = JSON.parse(raw);
    const table = {};
    for (const [k, v] of Object.entries(obj)) {
      const norm = parseDiscountValue(v);
      if (norm) table[k] = norm;
    }
    return table;
  } catch { return {}; }
}
function getPerProductDiscount(product, table) {
  return table[product.id] || table[product.slug] || null;
}

// --- Product code map: (slug veya id) -> productCode ---
function loadProductCodeMap() {
  try {
    const raw = process.env.CABO_PRODUCT_CODES_JSON || "";
    if (!raw) return {};
    const obj = JSON.parse(raw);
    const m = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.length >= 8) m[k] = v;
    }
    return m;
  } catch { return {}; }
}
function getProductCode(product, map) {
  return map[product.id] || map[product.slug] || null;
}

async function getUser() {
  try {
    const token = (await cookies()).get("auth_token")?.value;
    if (!token) return null;
    return await verifyAuthToken(token);
  } catch { return null; }
}

export async function POST(req) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Auth gerekli." }, { status: 401 });

    const body = await req.json();
    const data = BodySchema.parse(body);

    const ids = data.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, slug: true, name: true, price: true, isActive: true, imageUrl: true },
    });
    if (!products.length) return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 400 });

    const caboRef = (await cookies()).get(CABO_REF_COOKIE)?.value || null;
    const discountTable = loadDiscountTable();
    const pcMap = loadProductCodeMap();

    let totalOriginal = 0;
    let totalDiscount = 0;
    let totalPayable = 0;

    const orderItems = [];

    for (const it of data.items) {
      const p = products.find((x) => x.id === it.productId);
      if (!p) continue;

      const baseUnit = p.price;
      const baseLine = baseUnit * it.quantity;
      totalOriginal += baseLine;

      let finalUnit = baseUnit;
      if (caboRef) {
        const cfg = getPerProductDiscount(p, discountTable);
        if (cfg) {
          const unitDisc = cfg.type === "percent"
            ? round2((baseUnit * cfg.value) / 100)
            : round2(cfg.value);
          finalUnit = Math.max(0, round2(baseUnit - unitDisc));
          totalDiscount += round2((baseUnit - finalUnit) * it.quantity);
        }
      }

      totalPayable += round2(finalUnit * it.quantity);

      orderItems.push({
        productId: p.id,
        productSlug: p.slug,
        productCode: getProductCode(p, pcMap), // <-- YENİ
        quantity: it.quantity,
        priceAtPurchase: finalUnit,
      });
    }

    if (!orderItems.length) return NextResponse.json({ error: "Geçersiz sepet." }, { status: 400 });

    const orderNumber = "ORD-" + randomUUID().slice(0, 8).toUpperCase();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        totalAmount: round2(totalPayable),
        orderItems: {
          createMany: {
            data: orderItems.map(oi => ({
              productId: oi.productId,
              quantity: oi.quantity,
              priceAtPurchase: oi.priceAtPurchase, // indirimli birim
            })),
          },
        },
      },
      include: { orderItems: true },
    });

    // --- Cabo Webhook (HMAC) ---
    if (process.env.CABO_WEBHOOK_URL && process.env.CABO_HMAC_SECRET && process.env.CABO_KEY_ID) {
      const payload = {
        orderNumber: order.orderNumber,
        userId: user.id,
        caboRef: caboRef || null,
        totalOriginal: round2(totalOriginal),
        totalDiscount: round2(totalDiscount),
        totalPaid: round2(totalPayable),
        items: orderItems.map(oi => ({
          productId: oi.productId,
          productSlug: oi.productSlug,
          productCode: oi.productCode || null, // <-- YENİ: product_code taşınıyor
          quantity: oi.quantity,
          unitPriceCharged: oi.priceAtPurchase,
          lineTotal: round2(oi.priceAtPurchase * oi.quantity),
        })),
      };

      try {
        const raw = JSON.stringify(payload);
        const ts = Math.floor(Date.now() / 1000).toString();
        const sig = crypto
          .createHmac("sha256", process.env.CABO_HMAC_SECRET)
          .update(`${ts}.${raw}`)
          .digest("hex");

        await fetch(process.env.CABO_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Cabo-Timestamp": ts,
            "X-Cabo-Signature": sig,
            "X-Cabo-Key-Id": process.env.CABO_KEY_ID,
            "Cache-Control": "no-store",
          },
          body: raw,
        }).catch(() => {});
      } catch { /* webhook hatası siparişi bozmasın */ }
    }

    return NextResponse.json({
      ok: true,
      orderNumber: order.orderNumber,
      totalOriginal: round2(totalOriginal),
      totalDiscount: round2(totalDiscount),
      totalPaid: round2(totalPayable),
    });
  } catch (e) {
    return NextResponse.json({ error: "İşlem hatası." }, { status: 400 });
  }
}
