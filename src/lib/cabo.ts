import crypto from "node:crypto";

export interface CaboItem {
  code: string;        // merchant ürün kodu
  quantity: number;
  unit_price: number;  // kuruş
}

export interface CaboPayload {
  keyId: string;
  event: "purchase";
  orderNumber: string;
  email: string;
  totalAmount: number;         // kuruş
  discountTotal: number;       // kuruş
  items: CaboItem[];
  wid?: string;
  lid?: string;
}

function hmacSHA256(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export async function sendCaboWebhook(payload: CaboPayload): Promise<void> {
  const url = process.env.CABO_WEBHOOK_URL;
  const keyId = process.env.CABO_KEY_ID;
  const secret = process.env.CABO_HMAC_SECRET;

  if (!url || !keyId || !secret) return; // yapılandırılmadıysa sessizce geç

  const body = JSON.stringify(payload);
  const sig = hmacSHA256(secret, body);

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cabo-key-id": keyId,
      "x-cabo-signature": sig,
    },
    body,
  }).catch(() => { /* ağ hatası görmezden gelinsin */ });
}
