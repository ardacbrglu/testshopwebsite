import { createHmac } from "node:crypto";

export type CaboPostItem = {
  product_id?: number;
  product_code?: string;
  quantity: number;
  unit_price_cents: number;
  final_price_cents: number;
};

export async function postPurchaseToCabo(payload: {
  cartId: string;
  email: string;
  token?: string;
  linkId?: string;
  currency?: string;
  items: CaboPostItem[];
  total_cents: number;
}) {
  const url = process.env.CABO_WEBHOOK_URL;
  if (!url) return { ok: false, error: "CABO_WEBHOOK_URL missing" } as const;

  const keyId = process.env.CABO_KEY_ID || "";
  const secret = process.env.CABO_HMAC_SECRET || "";

  const body = JSON.stringify({
    key_id: keyId,
    cart_id: payload.cartId,
    email: payload.email,
    token: payload.token,
    link_id: payload.linkId,
    currency: payload.currency || "TRY",
    items: payload.items,
    total_cents: payload.total_cents,
    ts: Date.now(),
  });

  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cabo-Signature": signature,
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false as const, status: resp.status, error: text || resp.statusText };
  }
  return { ok: true as const };
}
