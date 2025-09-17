// src/app/api/checkout/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { uid } from "@/lib/format";
import { getBySlug } from "@/lib/db";

const CABO_WEBHOOK_URL = process.env.CABO_WEBHOOK_URL;
const KEY_ID = process.env.CABO_KEY_ID || "";
const HMAC_SECRET = process.env.CABO_HMAC_SECRET || "";
const REQUIRE_PRODUCT_CODE = String(process.env.REQUIRE_PRODUCT_CODE || "0") === "1";

function sign(ts, raw) {
  return crypto.createHmac("sha256", HMAC_SECRET).update(`${ts}.${raw}`).digest("hex");
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req) {
  // Bu route hiçbir durumda 500 dökmemeli; anlamlı hata kodları dönüyor.
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    const email = body?.email;

    if (!items.length) {
      return NextResponse.json({ ok: false, error: "empty_cart" }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const c = await cookies();
    const caboRef =
      c.get("cabo_ref")?.value || c.get("caboRef")?.value || null;
    const hasRef = Boolean(caboRef);

    // Müşterinin gördüğü fiyata göre normalize (ref varsa indirimli)
    const normalized = items
      .map((it) => {
        const p = getBySlug(it.slug, hasRef);
        if (!p) return null;
        const qty = Math.max(1, Math.floor(it.quantity || 1));
        const unit = p.unitFinal ?? p.unitOriginal;
        return {
          slug: p.slug,
          name: p.name,
          quantity: qty,
          unitPrice: unit,
          contracted: p.contracted,
          productCode: p.productCode,
          lineTotal: Math.round(unit * qty * 100) / 100,
        };
      })
      .filter(Boolean);

    const orderTotal = normalized.reduce((s, n) => s + n.lineTotal, 0);
    const orderNumber = uid("ORD");

    // Cabo post (yalnızca ref varsa ve kontratlı ürün varsa)
    let caboResponse = { skipped: true, reason: "no_ref_or_no_items" };
    const contractedItems = normalized.filter(
      (n) => hasRef && n.contracted && (!REQUIRE_PRODUCT_CODE || n.productCode)
    );

    if (
      hasRef &&
      contractedItems.length > 0 &&
      CABO_WEBHOOK_URL &&
      KEY_ID &&
      HMAC_SECRET
    ) {
      try {
        const payload = {
          orderNumber,
          caboRef,
          customerEmail: email, // bilgi amaçlı (platform tarafında opsiyonel)
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
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }
        caboResponse = { status: res.status, data: parsed };
      } catch (err) {
        caboResponse = { error: "webhook_failed", message: String(err?.message || err) };
      }
    }

    // Başarıyı döndür (localStorage sipariş kaydı client’ta)
    return NextResponse.json(
      {
        ok: true,
        orderNumber,
        summary: {
          total: Math.round(orderTotal * 100) / 100,
          itemCount: normalized.reduce((s, n) => s + n.quantity, 0),
          email,
        },
        cabo: caboResponse,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // yakalanmayan bir şey olursa yine de kontrollü hata
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 400 });
  }
}
