import { createHmac } from "crypto";
import { query } from "./db";

/** ---- Types ---- */
type Nullable<T> = T | null | undefined;
type HeadersDict = Record<string, string>;

export interface CaboItemIn {
  product_id?: number;
  product_code?: string;
  quantity: number;
  unit_price_cents: number;
  final_price_cents: number;
}

interface OutboundItemNew {
  productCode?: string;
  productId?: number;
  quantity: number;
  unitPriceCharged?: number; // TL (unit)
  lineTotal: number;         // TL (line)
}

interface OutboundPayloadNew {
  orderNumber: string;
  caboRef: string | null;
  email: string;
  linkId: number | string | null;
  items: OutboundItemNew[];
}

interface OutboundItemLegacy {
  productCode?: string;
  quantity: number;
  amount: number;   // TL (line)
  currency: "TRY";
}

interface OutboundPayloadLegacy {
  token: string | null;
  orderId: string;
  status: "confirmed";
  products: OutboundItemLegacy[];
}

type OutboundPayload = OutboundPayloadNew | OutboundPayloadLegacy;

interface LogOutboundArgs {
  orderId?: number | null;
  url: string;
  keyId: string;
  tsSec: number;
  signature: string;
  payload: OutboundPayload;
  headers: HeadersDict;
  statusCode?: number | null;
  responseBody?: string | null;
  errorText?: string | null;
}

/** ---- Helpers ---- */
function toUnitTL(cents: number): number {
  return Math.round((Number(cents || 0) / 100) * 10000) / 10000;
}

// Kanonik JSON
function stableStringify(input: unknown): string {
  const seen = new WeakSet<object>();
  const stringify = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(stringify).join(",")}]`;
    const obj = v as Record<string, unknown>;
    if (seen.has(obj)) return "{}";
    seen.add(obj);
    const keys = Object.keys(obj).sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${stringify(obj[k])}`).join(",");
    return `{${body}}`;
  };
  return stringify(input);
}

function signHeaders(keyId: string, tsSec: number, body: string, secretRaw: string) {
  const secret = secretRaw.trim();
  const signature = createHmac("sha256", secret).update(`${tsSec}.${body}`).digest("hex");

  let canonicalSig = "";
  try {
    const canonicalBody = stableStringify(JSON.parse(body));
    canonicalSig = createHmac("sha256", secret).update(`${tsSec}.${canonicalBody}`).digest("hex");
  } catch {}

  const headers: HeadersDict = {
    "Content-Type": "application/json",
    "X-Cabo-Key-Id": keyId,
    "X-Cabo-Timestamp": String(tsSec),
    "X-Cabo-Signature": signature,
    "X-Key-Id": keyId,
    "X-Timestamp": String(tsSec),
    "X-Signature": signature,
  };
  if (canonicalSig) headers["X-Cabo-Signature-Canonical"] = canonicalSig;
  return { headers, signature };
}

async function tableExists(name: string): Promise<boolean> {
  const r = (await query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [name]
  )) as unknown as Array<{ c: number }>;
  return Number(r?.[0]?.c || 0) > 0;
}

async function logOutbound(args: LogOutboundArgs): Promise<void> {
  try {
    const payloadJson = JSON.stringify(args.payload);
    const headersJson = JSON.stringify(args.headers);

    try {
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
    } catch {}

    if (String(process.env.CABO_LOG_BOTH || "0") === "1" && (await tableExists("webhook_logs"))) {
      try {
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
      } catch {}
    }
  } catch {}
}

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
    await logOutbound({ orderId: orderId ?? null, url, keyId, tsSec, signature, payload, headers, statusCode, responseBody, errorText });
  }

  return statusCode != null && statusCode >= 200 && statusCode < 300;
}

/** ---- Public API ---- */
export async function postPurchaseToCabo(args: {
  orderId?: number | null;
  cartId: string;
  email: string;
  token?: string | null;
  linkId?: string | number | null;
  items: CaboItemIn[];        // ⬅︎ checkout, filtreledikten sonra geçer
  total_cents: number;
}): Promise<boolean> {
  const url = process.env.CABO_WEBHOOK_URL || "";
  if (!url) return false;

  const keyId = (process.env.CABO_KEY_ID || "TEST_KEY").trim();
  const secret = (process.env.CABO_HMAC_SECRET || "").trim();
  const useIds = String(process.env.CABO_USE_PRODUCT_IDS || "0") === "1";

  // Yeni payload
  const payloadNew: OutboundPayloadNew = {
    orderNumber: String(args.orderId ?? args.cartId),
    caboRef: args.token || null,
    email: args.email,
    linkId: args.linkId ?? null,
    items: args.items.map((it) => {
      const qty = Number(it.quantity || 1);
      const unitTL = toUnitTL(it.final_price_cents);
      const lineTL = toUnitTL(it.final_price_cents * qty);
      return {
        productCode: !useIds ? it.product_code : undefined,
        productId: useIds ? it.product_id : undefined,
        quantity: qty,
        unitPriceCharged: unitTL,
        lineTotal: lineTL,
      };
    }),
  };

  const okNew = await sendOnce(url, keyId, secret, args.orderId, payloadNew);
  if (okNew) return true;

  // Legacy fallback
  const payloadLegacy: OutboundPayloadLegacy = {
    token: args.token || null,
    orderId: String(args.orderId ?? args.cartId),
    status: "confirmed",
    products: args.items.map((it) => {
      const qty = Number(it.quantity || 1);
      const lineTL = toUnitTL(it.final_price_cents * qty);
      return { productCode: it.product_code, quantity: qty, amount: lineTL, currency: "TRY" as const };
    }),
  };

  return await sendOnce(url, keyId, secret, args.orderId, payloadLegacy);
}
