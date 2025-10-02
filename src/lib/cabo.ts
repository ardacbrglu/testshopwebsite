import { createHmac } from "crypto";
import { query } from "./db";

/* yardımcılar */
async function tableExists(name: string): Promise<boolean> {
  const rows = (await query(
    `SELECT COUNT(*) AS c
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c || 0) > 0;
}

/** Başarılı/başarısız her durumda outbound log yaz */
export async function logOutboundWebhook(args: {
  orderId?: number | null;
  url: string;
  keyId: string;
  tsSec: number;
  signature: string;
  payload: unknown;
  statusCode?: number | null;
  responseBody?: string | null;
  errorText?: string | null;
}) {
  const payloadJson = JSON.stringify(args.payload ?? {});
  if (await tableExists("outboundWebhookLog")) {
    await query(
      `INSERT INTO outboundWebhookLog
         (orderId, url, keyId, tsSec, signature, statusCode, payloadJson, responseBody, errorText)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.orderId ?? null,
        args.url,
        args.keyId,
        args.tsSec,
        args.signature,
        args.statusCode ?? null,
        payloadJson,
        args.responseBody ?? null,
        args.errorText ?? null,
      ]
    );
    return;
  }

  if (await tableExists("webhook_logs")) {
    await query(
      `INSERT INTO webhook_logs (kind, payload)
       VALUES ('outbound', CAST(? AS JSON))`,
      [
        JSON.stringify({
          orderId: args.orderId ?? null,
          url: args.url,
          keyId: args.keyId,
          tsSec: args.tsSec,
          signature: args.signature,
          statusCode: args.statusCode ?? null,
          payload: JSON.parse(payloadJson),
          responseBody: args.responseBody ?? null,
          errorText: args.errorText ?? null,
        }),
      ]
    );
  }
}

/** Cabo purchase POST – hata fırlatmaz; daima log yazar. */
export async function postPurchaseToCabo(args: {
  orderId?: number | null;
  cartId: string;
  email: string;
  token?: string | null;
  linkId?: string | null;
  items: Array<{
    product_id?: number;
    product_code?: string;
    quantity: number;
    unit_price_cents: number;
    final_price_cents: number;
  }>;
  total_cents: number;
}): Promise<boolean> {
  const url = process.env.CABO_WEBHOOK_URL || "";
  if (!url) return false;

  const keyId = process.env.CABO_KEY_ID || "TEST_KEY";
  const secret = process.env.CABO_HMAC_SECRET || "";
  const tsSec = Math.floor(Date.now() / 1000);

  const payload = {
    type: "purchase",
    cart_id: args.cartId,
    order_id: args.orderId ?? null,
    email: args.email,
    token: args.token || null,
    link_id: args.linkId || null,
    total_cents: args.total_cents,
    items: args.items,
    ts: tsSec,
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorText: string | null = null;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cabo-Key-Id": keyId,
        "X-Cabo-Timestamp": String(tsSec),
        "X-Cabo-Signature": signature,
      },
      body,
    });

    const text = await r.text().catch(() => "");
    statusCode = r.status;

    // hata analizi daha okunaklı olsun diye statusText'i de ekleyelim
    const statusLine = `${r.status} ${r.statusText || ""}`.trim();
    // response çok uzun olursa DB’yi şişirmeyelim (2KB ile sınırla)
    const truncated = text.length > 2048 ? text.slice(0, 2048) + "…[truncated]" : text;
    responseBody = `status: ${statusLine}\n${truncated}`;
  } catch (e) {
    errorText = (e as Error).message || String(e);
  } finally {
    await logOutboundWebhook({
      orderId: args.orderId ?? null,
      url,
      keyId,
      tsSec,
      signature,
      payload,
      statusCode,
      responseBody,
      errorText,
    });
  }

  return statusCode != null && statusCode >= 200 && statusCode < 300;
}
