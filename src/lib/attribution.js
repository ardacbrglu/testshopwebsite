// src/lib/attribution.js
import { cookies } from "next/headers";
import { createHmac } from "crypto";

/* ----- helpers ----- */
function verifyCookie(value, secret) {
  if (!value) return null;
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64").toString("utf8");
  const expect = createHmac("sha256", secret).update(payload).digest("hex");
  if (expect !== sig) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

function readMap() {
  try {
    let raw = process.env.CABO_MAP_JSON || "{}";
    raw = raw.replace(/\r?\n/g, "").replace(/\s{2,}/g, " ");
    const obj = JSON.parse(raw);
    const map = {};
    for (const [slug, val] of Object.entries(obj)) {
      const pctStr = String(val?.discount ?? "0").trim().replace("%", "");
      const pct = Math.max(0, Math.min(90, parseInt(pctStr, 10) || 0));
      map[slug] = { code: val?.code || "", pct };
    }
    return map;
  } catch {
    return {};
  }
}

/* ----- public API (ASYNC!) ----- */
export async function getAttribution() {
  // ⬇️ Next 15: cookies() async
  const v = (await cookies()).get("cabo_attrib")?.value;
  const secret = process.env.TESTSHOP_COOKIE_SECRET || process.env.CABO_HMAC_SECRET || "dev-secret";
  const obj = verifyCookie(v, secret);
  if (!obj) return null;
  const ttlDays = parseInt(process.env.CABO_COOKIE_TTL_DAYS || "14", 10);
  if (Date.now() - (obj.ts || 0) > ttlDays * 24 * 60 * 60 * 1000) return null;
  return obj; // {ref,lid,scope,landingProduct,ts}
}

export function resolveDiscountPct(productSlug, attrib) {
  if (!attrib) return 0;
  const map = readMap();
  const entry = map[productSlug];
  if (!entry) return 0;
  const eligible =
    attrib.scope === "sitewide" ||
    (attrib.scope === "landing" && attrib.landingProduct && attrib.landingProduct === productSlug);
  return eligible ? entry.pct : 0;
}

export function calcDiscountedUnitPrice(kurus, attrib, productSlug) {
  const pct = resolveDiscountPct(productSlug, attrib);
  if (!pct) return { finalPrice: kurus, applied: false, discountPct: 0 };
  const finalPrice = Math.floor((kurus * (100 - pct)) / 100);
  return { finalPrice, applied: finalPrice < kurus, discountPct: pct };
}

export function getProductCodeFromMap(slug) {
  const map = readMap();
  return map[slug]?.code || "";
}
