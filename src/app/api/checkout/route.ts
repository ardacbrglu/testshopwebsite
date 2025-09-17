import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";

/** Checkout için minimal katalog — A,B,D anlaşmalı */
type Row = { slug: string; price: number; currency: string; contracted: boolean; productCode: string; };
const CATALOG: Row[] = [
  { slug: "product-a", price: 229.99,   currency: "TRY", contracted: true,  productCode: "A001" },
  { slug: "product-b", price: 49999.99, currency: "TRY", contracted: true,  productCode: "B001" },
  { slug: "product-c", price: 1999.99,  currency: "TRY", contracted: false, productCode: "C000" },
  { slug: "product-d", price: 23750.00, currency: "TRY", contracted: true,  productCode: "D001" },
  { slug: "product-e", price: 34.99,    currency: "TRY", contracted: false, productCode: "E000" },
  { slug: "product-f", price: 100000.00, currency: "TRY", contracted: false, productCode: "F000" },
];

function round2(n: number){ return Math.round(n*100)/100; }
function parsePercent(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const m = v.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; }
  return 0;
}
function envDiscountFor(slug: string, code: string): number {
  try {
    const raw = process.env.CABO_DISCOUNTS_JSON || "{}";
    const j = JSON.parse(raw) as Record<string, unknown>;
    return parsePercent(j[slug] ?? j[code] ?? 0);
  } catch { return 0; }
}
function hmac(secret: string, msg: string){ return crypto.createHmac("sha256", secret).update(msg).digest("hex"); }

type ClientCartItem = { slug: string; quantity: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as { items?: ClientCartItem[]; email?: string } | null;
    if (!body || !Array.isArray(body.items) || typeof body.email !== "string") {
      return NextResponse.json({ ok:false as const, error: "bad_request" }, { status: 400 });
    }

    // 🔧 Next 15 fix: cookies() -> await cookies()
    const cookieStore = await cookies();
    const token =
      cookieStore.get("caboRef")?.value ||
      cookieStore.get("cabo_ref")?.value ||
      null;

    const map = new Map(CATALOG.map(r => [r.slug, r]));

    const uiItems: { slug: string; name: string; quantity: number; unitPrice: number }[] = [];
    const caboItems: { productCode: string; quantity: number; unitPriceCharged: number; lineTotal: number }[] = [];

    let total = 0;
    for (const it of body.items) {
      const p = map.get(it.slug);
      if (!p) continue;
      const qty = Math.max(1, Math.floor(it.quantity || 1));

      // İndirim sadece (anlaşmalı + atribüsyon = token) ise
      const pct = (p.contracted && token) ? envDiscountFor(p.slug, p.productCode) : 0;
      const unit = pct > 0 ? round2(p.price * (1 - pct/100)) : p.price;
      const line = round2(unit * qty);

      uiItems.push({ slug: p.slug, name: p.slug.replace(/-/g," ").toUpperCase(), quantity: qty, unitPrice: unit });
      total += line;

      // Cabo'ya sadece anlaşmalı + atribüsyonlu kalemler
      if (p.contracted && token) {
        caboItems.push({
          productCode: p.productCode,
          quantity: qty,
          unitPriceCharged: unit, // indirim yansımış halde
          lineTotal: line,
        });
      }
    }

    const orderNumber = "TS-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    // Cabo webhook
    let message = "no_contract_or_no_attribution";
    if (caboItems.length > 0 && token) {
      const payload = { orderNumber, caboRef: token, items: caboItems, status: "confirmed" as const };

      const keyId = process.env.CABO_KEY_ID || "";
      const secret = (process.env as Record<string,string|undefined>)[`MERCHANT_KEY_${keyId}`];
      const url = process.env.CABO_WEBHOOK_URL;

      if (url && keyId && secret) {
        const ts = Math.floor(Date.now()/1000);
        const raw = JSON.stringify(payload);
        const sig = hmac(secret, `${ts}.${raw}`);

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Cabo-Key-Id": keyId, "X-Key-Id": keyId,
            "X-Cabo-Timestamp": String(ts), "X-Timestamp": String(ts),
            "X-Cabo-Signature": sig, "X-Signature": sig,
          },
          body: raw,
          cache: "no-store",
        });

        message = res.ok ? "webhook_ok" : `webhook_failed_${res.status}`;
      } else {
        message = "webhook_not_configured";
      }
    }

    return NextResponse.json({
      ok: true as const,
      orderNumber,
      email: String(body.email || ""),
      items: uiItems,
      summary: { total: round2(total), itemCount: uiItems.reduce((s,i)=>s+i.quantity,0) },
      message,
    });
  } catch {
    return NextResponse.json({ ok:false as const, error: "server_error" }, { status: 500 });
  }
}
