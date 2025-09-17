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
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
}

type ClientCartItem = { slug: string; quantity: number; caboRef?: string | null };
type UiOrderItem   = { slug: string; name: string; quantity: number; unitPrice: number };

export async function POST(req: Request) {
  try {
    const bodyUnknown = await req.json().catch(() => null);
    if (
      !bodyUnknown ||
      typeof bodyUnknown !== "object" ||
      !Array.isArray((bodyUnknown as { items?: unknown }).items) ||
      typeof (bodyUnknown as { email?: unknown }).email !== "string"
    ) {
      return NextResponse.json({ ok: false as const, error: "bad_request" }, { status: 400 });
    }

    const body  = bodyUnknown as { items: ClientCartItem[]; email: string };
    const items = body.items;

    // 👇 ÖNEMLİ: cookies() artık Promise olabilir → await!
    const store = await cookies();
    const cookieToken =
      store.get("caboRef")?.value ||
      store.get("cabo_ref")?.value ||
      null;

    const map = new Map(CATALOG_MIN.map((r) => [r.slug, r]));
    const uiItems: UiOrderItem[] = [];
    const caboItems: { productCode: string; quantity: number; unitPriceCharged: number; lineTotal: number }[] = [];

    let total = 0;
    for (const ci of items) {
      const product = map.get(ci.slug);
      if (!product) continue;

      const qty  = Math.max(1, Math.floor(ci.quantity || 1));
      const unit = product.price;
      const line = round2(unit * qty);
      total += line;

      uiItems.push({ slug: ci.slug, name: ci.slug.replace(/-/g, " ").toUpperCase(), quantity: qty, unitPrice: unit });

      const attributed = Boolean(ci.caboRef || cookieToken);
      if (product.contracted && attributed) {
        caboItems.push({ productCode: product.productCode, quantity: qty, unitPriceCharged: unit, lineTotal: line });
      }
    }

    const orderNumber = "TS-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    let caboMessage: string | undefined;

    if (caboItems.length > 0) {
      try {
        const caboRef = cookieToken || (items.find((x) => x.caboRef)?.caboRef ?? null);
        const payload = { orderNumber, caboRef, items: caboItems, status: "confirmed" };

        const keyId = process.env.CABO_KEY_ID || "";
        const secretEnvName = `MERCHANT_KEY_${keyId}`;
        const secret = (process.env as Record<string, string | undefined>)[secretEnvName];
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
              "X-Key-Id": keyId,       // backwards-compat
              "X-Timestamp": String(ts),
              "X-Signature": sig,
            },
            body: raw,
            cache: "no-store",
          });

          caboMessage = res.ok ? "webhook_ok" : `webhook_failed_${res.status}:${(await res.text().catch(() => ""))?.slice(0,120)}`;
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
