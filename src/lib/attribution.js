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

export function getAttribution() {
  const value = cookies().get("cabo_attrib")?.value;
  const secret = process.env.TESTSHOP_COOKIE_SECRET || "dev-secret";
  const obj = verify(value, secret);
  if (!obj) return null;
  if (Date.now() - (obj.ts || 0) > 14 * 24 * 60 * 60 * 1000) return null;
  return obj; // {ref,lid,scope,product,discountPct}
}

export function calcDiscountedUnitPrice(kurus, attrib, productSlug) {
  if (!attrib) return { finalPrice: kurus, applied: false, discountPct: 0 };

  const eligible =
    attrib.scope === "sitewide" ||
    (attrib.scope === "single" && attrib.product && attrib.product === productSlug);

  const pct = Math.max(0, Math.min(90, parseInt(attrib.discountPct || "0", 10)));
  if (!eligible || pct === 0) return { finalPrice: kurus, applied: false, discountPct: 0 };

  const finalPrice = Math.floor((kurus * (100 - pct)) / 100);
  return { finalPrice, applied: finalPrice < kurus, discountPct: pct };
}
