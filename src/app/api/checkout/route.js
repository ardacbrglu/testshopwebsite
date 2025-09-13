export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";

// --- ENV
const CABO_URL   = process.env.CABO_WEBHOOK_URL;
const KEY_ID     = process.env.CABO_KEY_ID;
const SECRET     = process.env.CABO_HMAC_SECRET;

// JSON env yükle
function readJsonEnv(name, fallback = "{}") {
  try { return JSON.parse(process.env[name] || fallback); }
  catch { return JSON.parse(fallback); }
}
const CODE_MAP   = readJsonEnv("CABO_PRODUCT_CODES_JSON", "{}"); // slug/id -> productCode

function bad(status, msg, extra) {
  return NextResponse.json({ ok:false, error: msg, ...(extra||{}) }, { status });
}
function ok(data) {
  return NextResponse.json({ ok:true, ...(data||{}) }, { status: 200 });
}
function hmac(secret, tsSec, raw) {
  return crypto.createHmac("sha256", secret).update(`${tsSec}.${raw}`).digest("hex");
}

export async function POST(req) {
  try {
    if (!CABO_URL || !KEY_ID || !SECRET) {
      return bad(500, "server_misconfigured");
    }

    const inp = await req.json().catch(() => ({}));
    const itemsIn = Array.isArray(inp?.items) ? inp.items : [];
    const caboRef = inp?.caboRef || null;
    if (!itemsIn.length) return bad(400, "no_items");

    // Satırları normalize et (productCode ekle, sayısal tipleri düzelt)
    const normItems = itemsIn.map((it) => {
      const slugOrId = it.productSlug || it.productId;
      const productCode =
        CODE_MAP[slugOrId] || CODE_MAP[it.productSlug] || CODE_MAP[it.productId] || null;

      const quantity = Number(it.quantity || 1);
      const unitPriceCharged = Number(it.unitPriceCharged ?? 0);
      const lineTotal = Number(
        it.lineTotal != null ? it.lineTotal : unitPriceCharged * quantity
      );

      return {
        productCode,
        productId: it.productId ?? undefined,
        productSlug: it.productSlug ?? undefined,
        quantity,
        unitPriceCharged,
        lineTotal
      };
    });

    // Cabo tarafında REQUIRE_PRODUCT_CODE=1 olduğundan productCode zorunlu
    const missing = normItems.filter(x => !x.productCode).map(x => x.productSlug || x.productId);
    if (missing.length) return bad(400, "missing_product_code", { missing });

    // Sipariş no (idempotency için aynı değeri header’da da kullanırız)
    const orderNumber = inp?.orderNumber || `TS${Date.now()}`;

    const outbound = {
      orderNumber,
      caboRef: caboRef || undefined,
      items: normItems
    };

    const raw = JSON.stringify(outbound);
    const ts  = Math.floor(Date.now()/1000);
    const sig = hmac(SECRET, ts, raw);

    const resp = await fetch(CABO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cabo-Key-Id": KEY_ID,
        "X-Cabo-Timestamp": String(ts),
        "X-Cabo-Signature": sig,
        "X-Request-Id": orderNumber
      },
      body: raw
    });

    const cabo = await resp.json().catch(()=> ({}));
    if (!resp.ok || cabo?.ok === false) {
      return bad(502, cabo?.error || "cabo_failed", { cabo });
    }

    return ok({ orderNumber, cabo });
  } catch (e) {
    console.error("[checkout] error:", e);
    return bad(500, "server_error");
  }
}

// Opsiyonel health
export async function GET() {
  return ok({ healthy: true });
}
