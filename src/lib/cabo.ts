// src/lib/cabo.ts
import { createHmac } from "crypto";
import { query } from "./db";

// --- Helpers
async function tableExists(name: string) {
  const rows = (await query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )) as Array<{ c: number }>;
  return Number(rows?.[0]?.c || 0) > 0;
}

async function logOutbound(args: {
  orderId?: number | null;
  url: string;
  keyId: string;
  tsSec: number;
  signature: string;
  payload: unknown;
  headers: Record<string,string>;
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
       VALUES (?,?,?,?,?,?,?,?,?)`,
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
  }
  if (String(process.env.CABO_LOG_BOTH || "0") === "1" && (await tableExists("webhook_logs"))) {
    await query(
      `INSERT INTO webhook_logs (kind, payload) VALUES ('outbound', CAST(? AS JSON))`,
      [
        JSON.stringify({
          orderId: args.orderId ?? null,
          url: args.url,
          keyId: args.keyId,
          tsSec: args.tsSec,
          signature: args.signature,
          headers: args.headers,
          statusCode: args.statusCode ?? null,
          payload: args.payload,
          responseBody: args.responseBody ?? null,
          errorText: args.errorText ?? null,
        }),
      ]
    );
  }
}

function toUnitTL(cents: number) {
  return Math.round((Number(cents || 0) / 100) * 10000) / 10000;
}

function signHeaders(keyId: string, tsSec: number, body: string, secret: string) {
  // İmza tam olarak `${tsSec}.${body}` üzerinden
  const signature = createHmac("sha256", secret).update(`${tsSec}.${body}`).digest("hex");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Cabo-Timestamp": String(tsSec),
    "X-Cabo-Signature": signature,
  };
  return { headers, signature };
}

async function sendOnce(url: string, keyId: string, secret: string, orderId: number | null | undefined, payload: unknown) {
  const tsSec = Math.floor(Date.now() / 1000);
  const body  = JSON.stringify(payload);        // <-- Gönderilecek asıl string
  const { headers, signature } = signHeaders(keyId, tsSec, body, secret);

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorText: string | null = null;

  try {
    const r = await fetch(url, { method: "POST", headers, body }); // <-- Aynı body stringi!
    const txt = await r.text().catch(() => "");
    statusCode = r.status;
    responseBody = `status: ${r.status} ${r.statusText}\n` + (txt.length > 4096 ? txt.slice(0,4096) + "…[truncated]" : txt);
  } catch (e) {
    errorText = (e as Error).message || String(e);
  } finally {
    await logOutbound({
      orderId: orderId ?? null,
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
  token?: string | null;
  linkId?: string | null;
  items: CaboItemIn[];
  total_cents: number;
}) {
  const url    = process.env.CABO_WEBHOOK_URL || "";
  if (!url) return false;
  const keyId  = process.env.CABO_KEY_ID || "TEST_KEY";
  const secret = process.env.CABO_HMAC_SECRET || "";

  // 1) Yeni (önerilen) şema
  const payloadNew = {
    orderNumber: String(args.orderId ?? args.cartId),
    caboRef: args.token || null,
    email: args.email,
    linkId: args.linkId ?? null,
    items: args.items.map((it) => ({
      productCode: it.product_code || undefined,
      productId: it.product_id || undefined,
      quantity: Number(it.quantity || 1),
      unitPriceCharged: toUnitTL(it.final_price_cents),
      lineTotal: toUnitTL(it.final_price_cents * (it.quantity || 1)),
    })),
  };
  const okNew = await sendOnce(url, keyId, secret, args.orderId, payloadNew);
  if (okNew) return true;

  // 2) Eski (legacy) şema – geriye dönük uyumluluk
  const payloadLegacy = {
    token: args.token || null,
    orderId: String(args.orderId ?? args.cartId),
    status: "confirmed",
    products: args.items.map((it) => ({
      productCode: it.product_code || undefined,
      quantity: Number(it.quantity || 1),
      amount: toUnitTL(it.final_price_cents * (it.quantity || 1)),
      currency: "TRY",
    })),
  };
  return await sendOnce(url, keyId, secret, args.orderId, payloadLegacy);
}
