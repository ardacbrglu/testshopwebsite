// src/lib/attribution.js
import { cookies } from "next/headers";
import { createHmac } from "crypto";

function verify(value, secret) {
  if (!value) return null;
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;
  const payload = Buffer.from(b64, "base64").toString("utf8");
  const expect = createHmac("sha256", secret).update(payload).digest("hex");
  if (expect !== sig) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

function parseMap() {
  try {
    // CABO_MAP_JSON bir JSON string; içindeki % işaretlerini temizleyeceğiz
    const raw = process.env.CABO_MAP_JSON || "{}";
    const obj = JSON.parse(raw);
    const map = {};
    for (const [slug, val] of Object.entries(obj)) {
      const pctStr = (val?.discount || "0").toString().trim().replace("%", "");
      const pct = Math.max(0, Math.min(90, parseInt(pctStr, 10) || 0));
      map[slug] = { code: val?.code || "", pct };
    }
    return map;
  } catch {
    return {};
  }
}

export function getAttribution() {
  const c = cookies().get("cabo_attrib")?.value;
  const secret = process.env.TESTSHOP_COOKIE_SECRET || process.env.CABO_HMAC_SECRET || "dev-secret";
  const obj = verify(c, secret);
  if (!obj) return null;
  const ttlDays = parseInt(process.env.CABO_COOKIE_TTL_DAYS || "14", 10);
  if (Date.now() - (obj.ts || 0) > ttlDays * 24 * 60 * 60 * 1000) return null;
  return obj; // {ref,lid,scope,landingProduct,...}
}

export function calcDiscountedUnitPrice(kurus, attrib, productSlug) {
  if (!attrib) return { finalPrice: kurus, applied: false, discountPct: 0 };

  const map = parseMap();
  const entry = map[productSlug];
  if (!entry) return { finalPrice: kurus, applied: false, discountPct: 0 };

  const eligible =
    attrib.scope === "sitewide" ||
    (attrib.scope === "landing" && attrib.landingProduct && attrib.landingProduct === productSlug);

  if (!eligible || !entry.pct) return { finalPrice: kurus, applied: false, discountPct: 0 };

  const finalPrice = Math.floor((kurus * (100 - entry.pct)) / 100);
  return { finalPrice, applied: finalPrice < kurus, discountPct: entry.pct };
}

// İsteğe bağlı: map'i dışarı ver (checkout'ta code doğrulamak için)
export function getProductCodeFromMap(slug) {
  const map = parseMap();
  return map[slug]?.code || "";
}
