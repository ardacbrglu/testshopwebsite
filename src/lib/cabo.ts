// src/lib/cabo.ts
import crypto from "node:crypto";

export interface CaboItem {
  productCode: string;          // ZORUNLU (REQUIRE_PRODUCT_CODE=1)
  quantity: number;             // adet
  unitPriceCharged: number;     // kuruş (indirim sonrası birim)
  lineTotal: number;            // unitPriceCharged * quantity
  productId?: number;           // opsiyonel
  productSlug?: string;         // opsiyonel
}

export interface CaboPayload {
  keyId: string;                // CABO_KEY_ID
  event: "purchase";
  orderNumber: string;
  email: string;
  totalAmount: number;          // kuruş (net)
  discountTotal: number;        // kuruş
  items: CaboItem[];
  caboRef?: string | null;      // wid/token
}

/** HMAC-SHA256( `${ts}.${rawBody}` ) -> hex */
function hmacSHA256(secret: string, ts: number, raw: string): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${raw}`, "utf8").digest("hex");
}

/**
 * Cabo webhook (fire-and-forget). Platform tarafı header’ları şu anahtarlarla bekler:
 *  - X-Cabo-Key-Id  (ayrıca X-Key-Id)
 *  - X-Cabo-Timestamp (epoch seconds)  (ayrıca X-Timestamp)
 *  - X-Cabo-Signature (hex)  (ayrıca X-Signature)
 */
export async function sendCaboWebhook(payload: CaboPayload): Promise<void> {
  const url = process.env.CABO_WEBHOOK_URL;
  const keyId = process.env.CABO_KEY_ID;
  const secret = process.env.CABO_HMAC_SECRET;

  if (!url || !keyId || !secret) return; // yapılandırılmadıysa sessizce geç

  // Gövde – stringleştir
  const rawBody = JSON.stringify(payload);
  // Timestamp (saniye)
  const ts = Math.floor(Date.now() / 1000);
  // İmza
  const sig = hmacSHA256(secret, ts, rawBody);

  // Header’ları iki isimle de gönderiyoruz (uyumluluk için)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Key-Id": keyId,
    "X-Cabo-Timestamp": String(ts),
    "X-Timestamp": String(ts),
    "X-Cabo-Signature": sig,
    "X-Signature": sig,
  };

  // Ağ hatası olursa uygulamayı boğmamak için swallow
  try {
    await fetch(url, { method: "POST", headers, body: rawBody, cache: "no-store" });
  } catch {
    // isteyerek sessiz geçiyoruz (opsiyonel: loglayabilirsin)
  }
}
