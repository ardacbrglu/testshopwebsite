// src/lib/cabo-integration.ts
import crypto from "node:crypto";

export type Discount = { type: "percent" | "fixed"; value: number };
export type CaboMapEntry = { code?: string; productId?: string; discount?: Discount };

type CaboScope = "landing" | "sitewide";

function parseDiscountStr(s?: string | null): Discount | undefined {
  if (!s || typeof s !== "string") return undefined;
  const S = s.trim().toUpperCase();
  if (S.endsWith("%")) {
    const n = Number(S.slice(0, -1));
    if (Number.isFinite(n) && n >= 0) return { type: "percent", value: n };
    return undefined;
  }
  if (S.endsWith("TRY") || S.endsWith("TL")) {
    const cut = S.endsWith("TRY") ? 3 : 2;
    const n = Number(S.slice(0, -cut));
    if (Number.isFinite(n) && n >= 0) return { type: "fixed", value: n };
    return undefined;
  }
  return undefined;
}

export function round2(n: number) { return Math.round(n * 100) / 100; }

export function applyDiscount(price: number, d?: Discount) {
  if (!d) return { final: round2(price), label: null as string | null };
  if (d.type === "percent") {
    const f = round2(price * (1 - d.value / 100));
    return { final: f, label: `-%${d.value}` };
  }
  const f = Math.max(0, round2(price - d.value));
  return { final: f, label: `-${d.value}TRY` };
}

// [CABO-INTEGRATION] Merchant .env -> CABO_KEY_ID, CABO_HMAC_SECRET, CABO_WEBHOOK_URL, CABO_USE_PRODUCT_IDS, CABO_MAP_JSON, CABO_ATTRIBUTION_SCOPE, CABO_COOKIE_TTL_DAYS
export function getCaboConfig() {
  const keyId = process.env.CABO_KEY_ID || "";
  const secret = process.env.CABO_HMAC_SECRET || "";
  const webhook = process.env.CABO_WEBHOOK_URL || "";
  const useProductIds = String(process.env.CABO_USE_PRODUCT_IDS || "0") === "1";
  const scope = ((process.env.CABO_ATTRIBUTION_SCOPE || "landing").toLowerCase() as CaboScope);
  const cookieTtlDays = Number(process.env.CABO_COOKIE_TTL_DAYS || "14");

  let raw: Record<string, { code?: string; productId?: string; discount?: string }> = {};
  try { raw = JSON.parse(process.env.CABO_MAP_JSON || "{}"); } catch { raw = {}; }

  const map: Record<string, CaboMapEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    const slug = k.startsWith("product-") ? k : `product-${k.toLowerCase()}`;
    map[slug] = {
      code: v.code,
      productId: v.productId,
      discount: parseDiscountStr(v.discount),
    };
  }

  return { keyId, secret, webhook, map, useProductIds, scope, cookieTtlDays };
}

function parseCookie(headerVal: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headerVal) return out;
  const parts = headerVal.split(";").map((s) => s.trim());
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i > 0) {
      const k = decodeURIComponent(p.slice(0, i).trim());
      const v = decodeURIComponent(p.slice(i + 1).trim());
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

export function refFromRequest(req: Request) {
  const u = new URL(req.url);
  const token = (req.headers.get("x-cabo-ref") || u.searchParams.get("token") || "").trim();
  const cookies = parseCookie(req.headers.get("cookie"));
  const cookieToken = (cookies["cabo_ref"] || "").trim();
  const landingSlug = (cookies["cabo_landing_slug"] || "").trim();

  const preview = req.headers.get("x-cabo-preview") === "1";
  const activeToken = token || cookieToken;

  return {
    token: activeToken || null,
    landingSlug: landingSlug || null,
    preview,
    active: Boolean(activeToken),
  };
}

export function isDiscountActiveFor(
  productSlug: string,
  opts: { scope: CaboScope; tokenActive: boolean; landingSlug?: string | null; preview?: boolean }
) {
  if (!opts.tokenActive) return false;
  if (opts.scope === "sitewide") return true;
  if (opts.preview) return true;
  return opts.landingSlug ? opts.landingSlug === productSlug : false;
}

// [CABO-INTEGRATION] S2S imza formatı (sha256 HMAC): `${ts}.${rawBody}`
export function hmacSha256Hex(secret: string, msg: string) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}
