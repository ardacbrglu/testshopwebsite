// src/lib/cabo.ts
import crypto from "crypto";

const KEY_ID = String(process.env.CABO_KEY_ID || "TESTSHOP1");
const SECRET = String(process.env.CABO_HMAC_SECRET || "");
const URL = String(process.env.CABO_WEBHOOK_URL || "").trim();

function makeHmac(ts: number, raw: string) {
  return crypto.createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
}

export async function postPurchaseToCabo(input: {
  orderId: number | string;
  cartId: string;
  email: string;
  token: string | null;
  linkId: number | string | null;
  items: Array<{
    product_id?: number;
    product_code?: string;
    quantity: number;
    unit_price_cents: number;
    final_price_cents: number;
  }>;
  total_cents: number;
}) {
  if (!URL) return; // webhook kapalıysa sessiz çık
  if (!SECRET) throw new Error("CABO_HMAC_SECRET missing");

  const ts = Math.floor(Date.now() / 1000);

  // Cabo purchase_callback senin yeni formatı da kabul ediyordu: orderNumber + items
  // Burada orderNumber string verelim:
  const orderNumber = typeof input.orderId === "string" ? input.orderId : `TS-${input.orderId}`;

  const payload = {
    orderNumber,
    cartId: input.cartId,
    email: input.email,
    caboRef: input.token || null,
    linkId: input.linkId ?? null,
    status: "confirmed",
    items: input.items.map((it) => ({
      productId: it.product_id ?? undefined,
      productCode: it.product_code ?? undefined,
      quantity: Math.max(1, Number(it.quantity) || 1),
      unitPriceCharged: Math.max(0, Number(it.final_price_cents || 0)) / 100, // istersen kaldırabilirsin
      lineTotal: Math.max(0, Math.round(Number(it.final_price_cents || 0) * Math.max(1, Number(it.quantity) || 1))) / 100,
      productSlug: undefined,
    })),
  };

  const raw = JSON.stringify(payload);
  const sig = makeHmac(ts, raw);

  await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cabo-key-id": KEY_ID,
      "x-cabo-timestamp": String(ts),
      "x-cabo-signature": sig,
    },
    body: raw,
    cache: "no-store",
  });
}
