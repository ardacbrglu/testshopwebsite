// src/app/api/checkout/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test Shop "checkout"
 * - Sepetteki kalemleri sunucuda yeniden fiyatlar (indirim güvenliği)
 * - Cabo purchase_callback'e HMAC-SHA256 ile POST eder
 */

import crypto from "crypto";
import { NextResponse } from "next/server";

const round2 = (n)=>Math.round(n*100)/100;

function parseJSONSafe(src, fallback) {
  try { return JSON.parse(src || ""); } catch { return fallback; }
}
const DISCOUNTS = parseJSONSafe(process.env.CABO_DISCOUNTS_JSON, {});         // {"a":"10%","b":"50TRY"}
const PRODUCT_CODES = parseJSONSafe(process.env.CABO_PRODUCT_CODES_JSON, {}); // {"a":"uuid-..."}

function keyFromSlug(slug) {
  const m = /-([a-z0-9]+)$/i.exec(slug || "");
  return (m?.[1] || slug || "").toLowerCase();
}
function applyDiscount(base, spec) {
  if (!spec) return base;
  const s = String(spec).trim().toUpperCase();
  if (s.endsWith("%")) {
    const p = parseFloat(s);
    return Math.max(0, round2(base * (1 - p / 100)));
  }
  if (s.endsWith("TRY")) {
    const off = parseFloat(s);
    return Math.max(0, round2(base - off));
  }
  return base;
}
function sign(ts, raw, secret) {
  return crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
}
function orderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const rnd = Math.random().toString(36).slice(2,8).toUpperCase();
  return `TS-${ymd}-${rnd}`;
}

// Basit ürün kaynağı: kendi API'mizden çekiyoruz
async function fetchProductsByIds(origin, ids) {
  const url = `${origin}/api/products?ids=${encodeURIComponent(ids.join(","))}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function POST(req) {
  try {
    const body = await req.json().catch(()=>null);
    if (!body || !Array.isArray(body.items) || body.items.length===0) {
      return NextResponse.json({ ok:false, error:"empty_cart" }, { status: 400 });
    }

    // origin'i çıkar
    const origin = new URL(req.url).origin;

    // Ürünleri getir
    const ids = [...new Set(body.items.map(i => i.productId))];
    const products = await fetchProductsByIds(origin, ids);
    const pMap = new Map(products.map(p => [p.id, p]));

    // Token: sipariş seviyesinde ilk kalemin token'ını kullanıyoruz
    const caboRef = (body.items.find(i => i.token)?.token) || null;

    // Yeniden fiyatla
    const normalized = [];
    for (const it of body.items) {
      const p = pMap.get(it.productId);
      if (!p) continue;
      const key = keyFromSlug(p.slug);
      const unit = applyDiscount(p.price, DISCOUNTS[key]);
      const qty  = Math.max(1, parseInt(it.quantity || 1, 10));
      normalized.push({
        productId: p.id,
        productSlug: p.slug,
        productCode: PRODUCT_CODES[key] || undefined,
        quantity: qty,
        unitPriceCharged: unit,
        lineTotal: round2(unit * qty),
      });
    }
    if (normalized.length === 0) {
      return NextResponse.json({ ok:false, error:"no_valid_items" }, { status: 400 });
    }

    // Cabo payload
    const orderNumber = orderNo();
    const payload = {
      orderNumber,
      caboRef,                  // yoksa null gider, Cabo tarafı yine çalışır
      items: normalized.map(n => ({
        productCode: n.productCode,         // Cabo tarafında product match için en sağlam alan
        productId: n.productId,             // yedek
        productSlug: n.productSlug,         // yedek
        quantity: n.quantity,
        unitPriceCharged: n.unitPriceCharged,
        lineTotal: n.lineTotal,
      })),
    };

    // HMAC imza ve POST
    const ts = Math.floor(Date.now()/1000);
    const raw = JSON.stringify(payload);
    const sig = sign(ts, raw, process.env.CABO_HMAC_SECRET || "");
    const res = await fetch(process.env.CABO_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cabo-Key-Id": process.env.CABO_KEY_ID || "",
        "X-Cabo-Timestamp": String(ts),
        "X-Cabo-Signature": sig,
      },
      body: raw,
    });

    const j = await res.json().catch(()=>null);
    if (!res.ok || !j?.ok) {
      return NextResponse.json({ ok:false, error: j?.error || "webhook_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok:true, orderNumber }, { status: 200 });

  } catch (e) {
    return NextResponse.json({ ok:false, error:"server_error" }, { status: 500 });
  }
}
