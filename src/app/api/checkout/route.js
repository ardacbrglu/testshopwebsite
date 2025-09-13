export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";

// ---- helpers
const j = (status, obj) => NextResponse.json(obj, { status });
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const pctOf = (price, rule) => {
  const m = rule && String(rule).match(/-?\d+(\.\d+)?/);
  if (!m) return { unit: price, pct: null };
  const pct = parseFloat(m[0]);
  if (!Number.isFinite(pct)) return { unit: price, pct: null };
  const unit = +(price * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(2);
  return { unit, pct };
};

function pickCode(codes, p) {
  const shortKey = p.slug?.startsWith("product-") ? p.slug.slice(8) : p.slug?.split("-").pop();
  return codes[p.slug] ?? codes[shortKey] ?? codes[p.id] ?? null;
}
function pickRule(discounts, p) {
  const shortKey = p.slug?.startsWith("product-") ? p.slug.slice(8) : p.slug?.split("-").pop();
  return discounts[p.slug] ?? discounts[shortKey] ?? discounts[p.id] ?? null;
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return j(400, { error: "bad_json" }); }

  const items = Array.isArray(body?.items) ? body.items : [];
  const caboRef = body?.caboRef || null;
  if (!items.length) return j(400, { error: "empty_cart" });

  // env
  let discounts = {};
  let codes = {};
  try { discounts = JSON.parse(process.env.CABO_DISCOUNTS_JSON || "{}"); } catch {}
  try { codes = JSON.parse(process.env.CABO_PRODUCT_CODES_JSON || "{}"); } catch {}

  // ürünleri çek
  const ids = [...new Set(items.map((i) => i.productId))].join(",");
  const origin = new URL(req.url).origin;
  const products = await fetch(`${origin}/api/products?ids=${encodeURIComponent(ids)}`, { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => []);

  const map = new Map((Array.isArray(products) ? products : []).map((p) => [p.id, p]));

  // satırlar
  const outItems = [];
  for (const it of items) {
    const p = map.get(it.productId);
    if (!p) return j(400, { error: `product_not_found_${it.productId}` });

    const price = n(p.price);
    if (!Number.isFinite(price)) return j(400, { error: `bad_price_${p.id}` });

    const rule = pickRule(discounts, p);              // sadece yüzde (TRY türünü yok sayar)
    const { unit } = pctOf(price, rule);
    const quantity = Math.max(1, Number(it.quantity || 1));
    const lineTotal = +(unit * quantity).toFixed(2);

    const productCode = pickCode(codes, p);
    if (!productCode) return j(400, { error: `missing_product_code_${p.slug || p.id}` });

    outItems.push({
      productCode,
      productId: String(p.id),
      productSlug: p.slug,
      quantity,
      unitPriceCharged: unit,
      lineTotal,
    });
  }

  // payload & imza
  const payload = {
    orderNumber: `TS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    caboRef,
    items: outItems,
  };
  const raw = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const secret = process.env.CABO_HMAC_SECRET || "";
  const keyId = process.env.CABO_KEY_ID || "";
  const url = process.env.CABO_WEBHOOK_URL || "";

  if (!secret || !keyId || !url) return j(500, { error: "misconfigured_env" });

  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cabo-Key-Id": keyId,
      "X-Cabo-Timestamp": String(ts),
      "X-Cabo-Signature": sig,
    },
    body: raw,
  });

  const text = await resp.text();
  if (!resp.ok) {
    return j(502, { error: "cabo_webhook_failed", status: resp.status, detail: text?.slice(0, 300) });
  }
  return j(200, { ok: true, orderNumber: payload.orderNumber });
}
