// src/lib/cabo.ts
import crypto from "node:crypto";

export interface CaboItem {
  productCode: string;
  quantity: number;
  unitPriceCharged: number; // kuruş
  lineTotal: number;        // kuruş
  productId?: number;
  productSlug?: string;
}

export interface CaboPayload {
  keyId: string;
  event: "purchase";
  orderNumber: string;
  email: string;
  totalAmount: number;      // kuruş
  discountTotal: number;    // kuruş
  items: CaboItem[];
  caboRef?: string | null;
}

/** HMAC-SHA256( `${ts}.${rawBody}` ) -> hex */
function hmacSHA256(secret: string, ts: number, raw: string): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${raw}`, "utf8").digest("hex");
}

/**
 * Cabo webhook (fire-and-forget) — fakat ayrıntılı LOG üretir.
 * Railway loglarında “CABO WEBHOOK …” satırlarını göreceksin.
 */
export async function sendCaboWebhook(payload: CaboPayload): Promise<void> {
  const url = process.env.CABO_WEBHOOK_URL;
  const keyId = process.env.CABO_KEY_ID;
  const secret = process.env.CABO_HMAC_SECRET;

  if (!url || !keyId || !secret) {
    console.warn("[CABO WEBHOOK] missing env (url/keyId/secret)");
    return;
  }

  const rawBody = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = hmacSHA256(secret, ts, rawBody);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Key-Id": keyId,
    "X-Cabo-Timestamp": String(ts),
    "X-Timestamp": String(ts),
    "X-Cabo-Signature": sig,
    "X-Signature": sig,
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: rawBody, cache: "no-store" });
    const txt = await res.text().catch(() => "");
    console.log(
      "[CABO WEBHOOK] POST",
      url,
      "status:",
      res.status,
      res.statusText,
      "| headers:", headers,
      "| body:", rawBody,
      "| response:", txt.slice(0, 500)
    );
  } catch (e) {
    console.error("[CABO WEBHOOK] network error:", (e as Error).message);
  }
}
