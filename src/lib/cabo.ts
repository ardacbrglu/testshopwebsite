import { createHmac } from "crypto";
import { query } from "./db";

/* --------- DB helpers --------- */
async function tableExists(name: string): Promise<boolean> {
  const rows = (await query(
    `SELECT COUNT(*) AS c
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c || 0) > 0;
}

async function logOutboundWebhook(args: {
  orderId?: number | null;
  url: string;
  keyId: string;
  tsSec: number;
  signature: string;
  payload: unknown;
  headers: Record<string, string>;
  statusCode?: number | null;
  responseBody?: string | null;
  errorText?: string | null;
}) {
  const payloadJson = JSON.stringify(args.payload ?? {});
  const headersJson = JSON.stringify(args.headers ?? {});
  if (await tableExists("outboundWebhookLog")) {
    await query(
      `INSERT INTO outboundWebhookLog
         (orderId, url, keyId, tsSec, signature, statusCode, payloadJson, responseBody, errorText)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.orderId ?? null,
        `${args.url}\nHEADERS: ${headersJson}`,
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
          headers: args.headers ?? {},
          payload: JSON.parse(payloadJson),
          responseBody: args.responseBody ?? null,
          errorText: args.errorText ?? null,
        }),
      ]
    );
  }
}

/* --------- Cabo POST --------- */
type CaboItemIn = {
  product_id?: number;
  product_code?: string;
  quantity: number;
  unit_price_cents: number;
  final_price_cents: number;
};

export async function postPurchaseToCabo(args: {
  orderId?: number | null;
  cartId: string;
  email: string;
  token?: string | null;   // referral token (caboRef)
  linkId?: string | null;
  items: CaboItemIn[];
  total_cents: number;
}): Promise<boolean> {
  const url = process.env.CABO_WEBHOOK_URL || "";
  if (!url) return false;

  const keyId = process.env.CABO_KEY_ID || "TEST_KEY";
  const secret = process.env.CABO_HMAC_SECRET || "";
  const tsSec = Math.floor(Date.now() / 1000);

  // ---- Yeni format payload (TL birimi; cents -> /100) ----
  const toUnit = (cents: number) => Math.round((Number(cents || 0) / 100) * 10000) / 10000;
  const payload = {
    orderNumber: String(args.orderId ?? args.cartId),
    caboRef: args.token || null,
    // opsiyonel alanlar – server parse etmiyorsa yok sayar
    email: args.email,
    linkId: args.linkId ?? null,
    items: args.items.map((it) => ({
      // En az bir tanesi dolu olmalı: productCode | productId | productSlug
      productCode: it.product_code || undefined,
      productId: it.product_id || undefined,
      // productSlug'ı bilmiyoruz; code/id yoksa server zaten reddedecek
      quantity: Number(it.quantity || 1),
      unitPriceCharged: toUnit(it.final_price_cents),               // birim fiyat (indirimli)
      lineTotal: toUnit(it.final_price_cents * (it.quantity || 1)), // satır toplamı
    })),
  };

  const body = JSON.stringify(payload);

  // ---- HMAC: `${ts}.${rawBody}` ----
  const signature = createHmac("sha256", secret)
    .update(`${tsSec}.${body}`)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Cabo-Timestamp": String(tsSec),
    "X-Cabo-Signature": signature,
    // Eski başlık isimleri de kabul ediliyor – güvenlik için ekleyelim:
    "X-Key-Id": keyId,
    "X-Timestamp": String(tsSec),
    "X-Signature": signature,
  };

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorText: string | null = null;

  try {
    const r = await fetch(url, { method: "POST", headers, body });
    const text = await r.text().catch(() => "");
    statusCode = r.status;
    const statusLine = `${r.status} ${r.statusText || ""}`.trim();
    responseBody =
      `status: ${statusLine}\n` +
      (text.length > 4096 ? text.slice(0, 4096) + "…[truncated]" : text);
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
      headers,
      statusCode,
      responseBody,
      errorText,
    });
  }

  return statusCode != null && statusCode >= 200 && statusCode < 300;
}
