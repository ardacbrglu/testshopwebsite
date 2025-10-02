// src/lib/cabo.ts
import { createHmac } from "crypto";
import { query } from "./db";

/** ---------- Type helpers ---------- */
type HeadersMap = Record<string, string>;

type Nullable<T> = T | null | undefined;

export type CaboItemIn = {
  product_id?: number;
  product_code?: string;
  quantity: number;
  unit_price_cents: number;
  final_price_cents: number;
};

export type CaboOutboundPayloadNew = {
  orderNumber: string;
  caboRef: string | null;
  email: string;
  linkId: number | string | null;
  items: Array<{
    productCode?: string;
    productId?: number;
    quantity: number;
    unitPriceCharged: number; // TL (unit)
    lineTotal: number;        // TL (unit)
  }>;
};

export type CaboOutboundPayloadLegacy = {
  token: string | null;
  orderId: string;
  status: "confirmed";
  products: Array<{
    productCode?: string;
    quantity: number;
    amount: number; // TL (unit)
    currency: "TRY";
  }>;
};

type OutboundPayload = CaboOutboundPayloadNew | CaboOutboundPayloadLegacy;

type LogOutboundArgs = {
  orderId?: number | null;
  url: string;
  keyId: string;
  tsSec: number;
  signature: string;
  payload: OutboundPayload;
  headers: HeadersMap;
  statusCode?: number | null;
  responseBody?: string | null;
  errorText?: string | null;
};

/** ---------- Small utils ---------- */
function toUnitTL(cents: number): number {
  const v = Number(cents || 0) / 100;
  // 4 ondalıkla yuvarla
  return Math.round(v * 10000) / 10000;
}

function stableJsonStringify(value: unknown): string {
  // Kanonik JSON (anahtar sıralı, gereksiz boşluksuz)
  const seen = new WeakSet<object>();
  const stringify = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (seen.has(v as object)) return "null";
    seen.add(v as object);

    if (Array.isArray(v)) {
      const arr = v.map(stringify);
      return `[${arr.join(",")}]`;
    }
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${stringify(obj[k])}`);
    }
    return `{${parts.join(",")}}`;
  };
  return stringify(value);
}

/** ---------- DB helpers ---------- */
async function tableExists(name: string): Promise<boolean> {
  const rows = (await query(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )) as unknown as Array<{ c: number }>;
  return Number(rows?.[0]?.c || 0) > 0;
}

async function logOutbound(args: LogOutboundArgs): Promise<void> {
  const payloadJson = JSON.stringify(args.payload);
  const headersJson = JSON.stringify(args.headers);

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
  }

  if (String(process.env.CABO_LOG_BOTH || "0") === "1" && (await tableExists("webhook_logs"))) {
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
          headers: args.headers,
          payload: args.payload,
          responseBody: args.responseBody ?? null,
          errorText: args.errorText ?? null,
        }),
      ]
    );
  }
}

/** ---------- HMAC & headers ---------- */
function signHeaders(
  keyId: string,
  tsSec: number,
  rawBody: string,
  secret: string
): { headers: HeadersMap; signature: string; signatureCanonical: string } {
  // Asıl imza: ts.body
  const signature = createHmac("sha256", secret).update(`${tsSec}.${rawBody}`).digest("hex");
  // Kanonik imza: ts.canonicalJson
  const canonical = stableJsonStringify(JSON.parse(rawBody));
  const signatureCanonical = createHmac("sha256", secret)
    .update(`${tsSec}.${canonical}`)
    .digest("hex");

  const headers: HeadersMap = {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Cabo-Timestamp": String(tsSec),
    "X-Cabo-Signature": signature,
    "X-Cabo-Signature-Canonical": signatureCanonical,
    // Eski isimler (geriye uyumluluk)
    "X-Key-Id": keyId,
    "X-Timestamp": String(tsSec),
    "X-Signature": signature,
    "X-Signature-Canonical": signatureCanonical,
  };
  return { headers, signature, signatureCanonical };
}

/** ---------- Sender ---------- */
async function sendOnce(
  url: string,
  keyId: string,
  secret: string,
  orderId: Nullable<number>,
  payload: OutboundPayload
): Promise<boolean> {
  const tsSec = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const { headers, signature } = signHeaders(keyId, tsSec, body, secret);

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorText: string | null = null;

  try {
    const r = await fetch(url, { method: "POST", headers, body });
    const txt = await r.text().catch(() => "");
    statusCode = r.status;
    const statusLine = `${r.status} ${r.statusText || ""}`.trim();
    responseBody = `status: ${statusLine}\n` + (txt.length > 4096 ? txt.slice(0, 4096) + "…[truncated]" : txt);
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

/** ---------- Public API ---------- */
export async function postPurchaseToCabo(args: {
  orderId?: number | null;
  cartId: string;
  email: string;
  token?: string | null;
  linkId?: string | null;
  items: CaboItemIn[];
  total_cents: number;
}): Promise<boolean> {
  const url = process.env.CABO_WEBHOOK_URL || "";
  if (!url) return false;

  const keyId = process.env.CABO_KEY_ID || "TEST_KEY";
  const secret = process.env.CABO_HMAC_SECRET || "";

  // 1) Yeni (önerilen) payload
  const payloadNew: CaboOutboundPayloadNew = {
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

  const okNew = await sendOnce(url, keyId, secret, args.orderId ?? null, payloadNew);
  if (okNew) return true;

  // 2) Legacy payload (fallback)
  const payloadLegacy: CaboOutboundPayloadLegacy = {
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

  const okLegacy = await sendOnce(url, keyId, secret, args.orderId ?? null, payloadLegacy);
  return okLegacy;
}
