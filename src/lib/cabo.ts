// src/lib/cabo.ts
import { createHmac } from "crypto";
import { query } from "./db";

function stableStringify(obj: any): string {
  const seen = new WeakSet();
  const sort = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return v;
      seen.add(v);
      if (Array.isArray(v)) return v.map(sort);
      const out: any = {};
      for (const k of Object.keys(v).sort()) out[k] = sort(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(obj));
}

function sign(secret: string, tsSec: number, body: string) {
  return createHmac("sha256", secret).update(`${tsSec}.${body}`).digest("hex");
}

function buildHeaders(keyId: string, tsSec: number, sigRaw: string, sigCanon: string) {
  return {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Cabo-Timestamp": String(tsSec),
    "X-Cabo-Signature": sigRaw,                 // raw body imzası
    "X-Cabo-Signature-Canonical": sigCanon,     // kanonik JSON imzası
    // Eski adlar yine dursun (opsiyonel)
    "X-Key-Id": keyId,
    "X-Timestamp": String(tsSec),
    "X-Signature": sigRaw,
  } as Record<string, string>;
}

async function tableExists(name: string) {
  const r = (await query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )) as unknown as Array<{ c: number }>;
  return Number(r?.[0]?.c || 0) > 0;
}

async function logOutbound(args: {
  orderId?: number | null;
  url: string;
  keyId: string;
  tsSec: number;
  signature: string;
  signatureCanonical?: string | null;
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
        args.signatureCanonical || args.signature,
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
          ...args,
        }),
      ]
    );
  }
}

function toUnitTL(cents: number) {
  return Math.round((Number(cents || 0) / 100) * 10000) / 10000;
}

async function sendOnce(
  url: string,
  keyId: string,
  secret: string,
  orderId: number | null | undefined,
  payload: unknown
) {
  const tsSec = Math.floor(Date.now() / 1000);

  // 1) raw body (tek stringify)
  const rawBody = JSON.stringify(payload);

  // 2) canonical body (anahtarları sıralı)
  const canonicalBody = stableStringify(JSON.parse(rawBody));

  // 3) iki ayrı imza
  const sigRaw = sign(secret.trim(), tsSec, rawBody);
  const sigCanon = sign(secret.trim(), tsSec, canonicalBody);

  const headers = buildHeaders(keyId, tsSec, sigRaw, sigCanon);

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorText: string | null = null;

  try {
    const r = await fetch(url, { method: "POST", headers, body: rawBody });
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
      signature: sigRaw,
      signatureCanonical: sigCanon,
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
  const url = process.env.CABO_WEBHOOK_URL || "";
  if (!url) return false;

  const keyId = process.env.CABO_KEY_ID || "TEST_KEY";
  const secret = (process.env.CABO_HMAC_SECRET || "").trim();

  // ÖNERİLEN payload
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

  // LEGACY fallback
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
