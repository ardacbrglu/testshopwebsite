import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { uid } from "@/lib/format";
import { getBySlug, getProductCode } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CABO_WEBHOOK_URL = process.env.CABO_WEBHOOK_URL;
const KEY_ID = process.env.CABO_KEY_ID || "";
const HMAC_SECRET = process.env.CABO_HMAC_SECRET || "";
const REQUIRE_PRODUCT_CODE = String(process.env.REQUIRE_PRODUCT_CODE || "0") === "1";

function sign(ts, raw) {
  return crypto.createHmac("sha256", HMAC_SECRET).update(`${ts}.${raw}`).digest("hex");
}

export async function POST(req) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ ok: false, error: "empty_cart" }, { status: 400 });

    const normalized = items.map((it) => {
      const p = getBySlug(it.slug);
      const qty = Math.max(1, Math.floor(it.quantity || 1));
      if (!p) return null;
      const unit = p.unitFinal ?? p.price;
      return {
        letter: p.id,
        slug: p.slug,
        name: p.name,
        quantity: qty,
        unitPrice: unit,
        contracted: p.contracted,
        productCode: getProductCode(p.id),
        lineTotal: Math.round(unit * qty * 100) / 100,
      };
    }).filter(Boolean);

    const contractedItems = normalized.filter((n) => n.contracted && (!REQUIRE_PRODUCT_CODE || n.productCode));

    const orderTotal = normalized.reduce((s, n) => s + n.lineTotal, 0);
    const orderNumber = uid("ORD");
    const caboRef = cookies().get("caboRef")?.value || null;
    let caboResponse = null;

    if (contractedItems.length > 0 && CABO_WEBHOOK_URL && KEY_ID && HMAC_SECRET) {
      const payload = {
        orderNumber,
        caboRef,
        items: contractedItems.map((n) => ({
          productCode: n.productCode || undefined,
          productSlug: n.slug,
          quantity: n.quantity,
          unitPriceCharged: n.unitPrice,
          lineTotal: n.lineTotal,
        })),
      };

      const raw = JSON.stringify(payload);
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = sign(ts, raw);

      const res = await fetch(CABO_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cabo-Key-Id": KEY_ID,
          "X-Key-Id": KEY_ID,
          "X-Cabo-Timestamp": ts,
          "X-Timestamp": ts,
          "X-Cabo-Signature": sig,
          "X-Signature": sig,
        },
        body: raw,
        cache: "no-store",
      });

      const text = await res.text();
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      caboResponse = { status: res.status, data: parsed };
    }

    return NextResponse.json({
      ok: true,
      orderNumber,
      summary: {
        total: Math.round(orderTotal * 100) / 100,
        itemCount: normalized.reduce((s, n) => s + n.quantity, 0),
      },
      cabo: caboResponse || { skipped: true, reason: "no_contracted_items_or_missing_env" },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
