// src/lib/cabo.ts
import crypto from "node:crypto";

export interface CaboItem {
  productCode: string;
  quantity: number;          // adet
  unitPriceCharged: number;  // kuruş
  lineTotal: number;         // kuruş
  productId?: number;
  productSlug?: string;
}

export interface CaboPayload {
  keyId: string;
  event: "purchase";
  orderNumber: string;
  email: string;
  totalAmount: number;       // kuruş
  discountTotal: number;     // kuruş
  items: CaboItem[];
  caboRef?: string | null;
}

/** HMAC-SHA256(`${ts}.${raw}`) -> hex */
function hmacSHA256(secret: string, ts: number, raw: string): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${raw}`, "utf8").digest("hex");
}

export interface CaboSendResult {
  status: number;
  ok: boolean;
  text: string;
  url: string;
}

/**
 * Cabo webhook’ını çağırır ve HTTP sonucunu döner.
 * Env: CABO_WEBHOOK_URL, CABO_KEY_ID, CABO_HMAC_SECRET
 */
export async function sendCaboWebhook(payload: CaboPayload): Promise<CaboSendResult> {
  const url = process.env.CABO_WEBHOOK_URL || "";
  const keyId = process.env.CABO_KEY_ID || "";
  const secret = process.env.CABO_HMAC_SECRET || "";

  if (!url || !keyId || !secret) {
    return { status: 0, ok: false, text: "missing_env", url };
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
    const text = await res.text().catch(() => "");
    return { status: res.status, ok: res.ok, text, url };
  } catch (e) {
    return { status: 0, ok: false, text: (e as Error).message, url };
  }
}
