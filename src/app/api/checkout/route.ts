import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";

// Checkout için minimal katalog – ürün kodları gerekir
type CatalogRow = {
  slug: string;
  currency: string;
  contracted: boolean;
  price: number;
  productCode: string;
};

const CATALOG_MIN: CatalogRow[] = [
  { slug: "product-a", currency: "TRY", contracted: true,  price: 229.99,   productCode: "A001" },
  { slug: "product-b", currency: "TRY", contracted: true,  price: 50000.00, productCode: "B001" },
  { slug: "product-c", currency: "TRY", contracted: false, price: 1999.99,  productCode: "C000" },
  { slug: "product-d", currency: "TRY", contracted: true,  price: 23750.00, productCode: "D001" },
  { slug: "product-e", currency: "USD", contracted: true,  price: 34.99,    productCode: "E001" },
  { slug: "product-f", currency: "TRY", contracted: false, price: 100000.00,productCode: "F000" },
];

function round2(n: number) { return Math.round(n * 100) / 100; }
function hmacSha256Hex(secret: string, msg: string) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}
function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

type ClientCartItem = { slug: string; quantity: number; caboRef?: string | null };
type UiOrderItem = { slug: string; name: string; quantity: number; unitPrice: number };

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray((raw as { items?: unknown }).items) ||
      typeof (raw as { email?: unknown }).email !== "string"
    ) {
      return NextResponse.json({ ok: false as const, error: "bad_request" }, { status: 400 });
    }

    const body = raw as { items: ClientCartItem[]; email: string };
    const items = body.items;

    // Next 15+: cookies() -> Promise<ReadonlyRequestCookies>
    const cookieStore = await cookies();
    const cookieToken =
      cookieStore.get("caboRef")?.value ??
      cookieStore.get("cabo_ref")?.value ??
      null;

    // ürün eşlemesi
    const map = new Map(CATALOG_MIN.map((r) => [r.slug, r]));
    const uiItems: UiOrderItem[] = [];
    const caboItems: { productCode: string; quantity: number; unitPriceCharged: number; lineTotal: number }[] = [];

    let total = 0;
    for (const ci of items) {
      const product = map.get(ci.slug);
      if (!product) continue;

      const qty = Math.max(1, Math.floor(ci.quantity || 1));
      const unit = product.price;
      const line = round2(unit * qty);
      total += line;

      uiItems.push({
        slug: ci.slug,
        name: ci.slug.replace(/-/g, " ").toUpperCase(),
        quantity: qty,
        unitPrice: unit,
      });

      // Yalnızca (1) anlaşmalı ve (2) atribüsyon olanlar Cabo’ya gitsin
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

    // Sipariş numarası
    const orderNumber =
      "TS-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    // Cabo webhook (best-effort)
    let caboMessage: string | undefined;

    if (caboItems.length > 0) {
      try {
        const caboRef = cookieToken || (items.find((x) => x.caboRef)?.caboRef ?? null);
        const payload = { orderNumber, caboRef, items: caboItems, status: "confirmed" };

        const keyId = process.env.CABO_KEY_ID || ""; // örn: TESTSHOP1
        const secretEnvName = `MERCHANT_KEY_${keyId}`; // örn: MERCHANT_KEY_TESTSHOP1
        const secret = (process.env as Record<string, string | undefined>)[secretEnvName];
        const webhookUrl = process.env.CABO_WEBHOOK_URL || "";
        const ts = Math.floor(Date.now() / 1000);

        if (!webhookUrl || !keyId || !secret) {
          caboMessage = "webhook_not_configured";
        } else {
          const rawBody = JSON.stringify(payload);
          const sig = hmacSha256Hex(secret, `${ts}.${rawBody}`);

          const res = await fetch(webhookUrl, {
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
            body: rawBody,
            cache: "no-store",
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            caboMessage = `webhook_failed_${res.status}${txt ? ":" + txt.slice(0, 120) : ""}`;
          } else {
            caboMessage = "webhook_ok";
          }
        }
      } catch (e: unknown) {
        caboMessage = `webhook_exception:${errMsg(e)}`;
      }
    } else {
      caboMessage = "no_contract_or_no_attribution";
    }

    return NextResponse.json({
      ok: true as const,
      orderNumber,
      email: String(body.email || ""),
      items: uiItems,
      summary: { total: round2(total), itemCount: uiItems.reduce((s, i) => s + i.quantity, 0) },
      message: caboMessage,
    });
  } catch {
    return NextResponse.json({ ok: false as const, error: "server_error" }, { status: 500 });
  }
}
