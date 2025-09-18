// src/lib/attribution.js
import { cookies } from "next/headers";
import { createHmac } from "crypto";

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
  } catch { return {}; }
}

export async function getAttribution() {
  const v = (await cookies()).get("cabo_attrib")?.value;
  const secret = process.env.TESTSHOP_COOKIE_SECRET || process.env.CABO_HMAC_SECRET || "dev-secret";
  const obj = verifyCookie(v, secret);
  return obj || null; // session cookie olduğundan ayrıca TTL kontrol etmiyoruz
}

export function calcDiscountedUnitPrice(kurus, attrib, productSlug) {
  if (!attrib) return { finalPrice: kurus, applied: false, discountPct: 0 };
  const map = readMap();
  const entry = map[productSlug];
  if (!entry || !entry.pct) return { finalPrice: kurus, applied: false, discountPct: 0 };

  const eligible =
    attrib.scope === "sitewide" ||
    (attrib.scope === "landing" && attrib.landingProduct && attrib.landingProduct === productSlug);

  if (!eligible) return { finalPrice: kurus, applied: false, discountPct: 0 };
  const finalPrice = Math.floor((kurus * (100 - entry.pct)) / 100);
  return { finalPrice, applied: finalPrice < kurus, discountPct: entry.pct };
}

export function getProductCodeFromMap(slug) {
  const map = readMap();
  return map[slug]?.code || "";
}
