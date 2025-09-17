import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";

type CatalogRow = {
  slug: string;
  currency: string;
  contracted: boolean;
  price: number;
  productCode: string;
};

const CATALOG_MIN: CatalogRow[] = [
  { slug: "product-a", currency: "TRY", contracted: true,  price: 229.99,   productCode: "A001" },
  { slug: "product-b", currency: "TRY", contracted: true,  price: 49999.99, productCode: "B001" },
  { slug: "product-c", currency: "TRY", contracted: false, price: 1999.99,  productCode: "C000" },
];

function round2(n: number) { return Math.round(n * 100) / 100; }
function hmacSha256Hex(secret: string, msg: string) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.items) || typeof body.email !== "string") {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }

    type ClientCartItem = { slug: string; quantity: number; caboRef?: string | null };
    const items: ClientCartItem[] = body.items;

    // ⬇⬇⬇ Next 15: cookies() -> await cookies()
    const store = await cookies();
    const cookieToken =
      store.get("caboRef")?.value ||
      store.get("cabo_ref")?.value ||
      null;

    const map = new Map(CATALOG_MIN.map((r) => [r.slug, r]));
    const uiItems: { slug: string; name: string; quantity: number; unitPrice: number }[] = [];
    const caboItems: { productCode: string; quantity: number; unitPriceCharged: number; lineTotal: number }[] = [];

    let total = 0;
    for (const ci of items) {
      const product = map.get(ci.slug);
      if (!product) continue;

      const qty = Math.max(1, Math.floor(ci.quantity || 1));
      const unit = product.price;
      const line = round2(unit * qty);

      total += line;

      // UI listesi (ismini basitçe slug'tan üretiyoruz)
      uiItems.push({ slug: ci.slug, name: ci.slug.replace(/-/g, " ").toUpperCase(), quantity: qty, unitPrice: unit });

      // Yalnızca (1) anlaşmalı ve (2) atribüteli satırlar Cabo’ya gitsin
      const attributed = Boolean(ci.caboRef || cookieToken);
      if (product.contracted && attributed) {
        caboItems.push({
          productCode: product.productCode,
          quantity: qty,
          unitPriceCharged: unit,
          lineTotal: line,
        });
      }
    }

    const orderNumber =
      "TS-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    // Webhook
    let caboMessage: string | undefined = undefined;

    if (caboItems.length > 0) {
      try {
        const caboRef = cookieToken || (items.find((x) => x.caboRef)?.caboRef ?? null);
        const payload = { orderNumber, caboRef, items: caboItems, status: "confirmed" };

        const keyId = process.env.CABO_KEY_ID || "";
        const secretEnvName = `MERCHANT_KEY_${keyId}`;
        const secret = (process.env as any)[secretEnvName] as string | undefined;
        const ts = Math.floor(Date.now() / 1000);

        if (!process.env.CABO_WEBHOOK_URL || !keyId || !secret) {
          caboMessage = "webhook_not_configured";
        } else {
          const raw = JSON.stringify(payload);
          const sig = hmacSha256Hex(secret, `${ts}.${raw}`);

          const res = await fetch(process.env.CABO_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Cabo-Key-Id": keyId,
              "X-Cabo-Timestamp": String(ts),
              "X-Cabo-Signature": sig,
              // geri uyum headerları:
              "X-Key-Id": keyId,
              "X-Timestamp": String(ts),
              "X-Signature": sig,
            },
            body: raw,
            cache: "no-store",
          });

          caboMessage = res.ok ? "webhook_ok" : `webhook_failed_${res.status}`;
        }
      } catch {
        caboMessage = "webhook_exception";
      }
    } else {
      caboMessage = "no_contract_or_no_attribution";
    }

    return NextResponse.json({
      ok: true,
      orderNumber,
      email: String(body.email || ""),
      items: uiItems,
      summary: { total: round2(total), itemCount: uiItems.reduce((s, i) => s + i.quantity, 0) },
      message: caboMessage,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
