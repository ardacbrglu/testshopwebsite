// Discount parser & applier (server only)
const RAW = process.env.CABO_DISCOUNTS_JSON || "{}";
/**
 * examples:
 * {"a":"10%","b":"50TRY","d":"5%"}
 */
let MAP = {};
try { MAP = JSON.parse(RAW); } catch { MAP = {}; }

function parseDiscount(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().toUpperCase();
  if (s.endsWith("%")) {
    const v = Number(s.slice(0, -1));
    if (Number.isFinite(v) && v > 0) return { kind: "percent", value: v };
  }
  if (s.endsWith("TRY")) {
    const v = Number(s.slice(0, -3));
    if (Number.isFinite(v) && v > 0) return { kind: "amount", value: v };
  }
  return null;
}

export function getDiscountForLetter(letter) {
  const d = MAP[String(letter || "").toLowerCase()];
  return parseDiscount(d);
}

export function applyDiscount(basePrice, disc) {
  const p = Number(basePrice || 0);
  if (!disc) return { has: false, unitFinal: p, unitOriginal: p, label: null, percentOff: 0 };

  let unitFinal = p;
  if (disc.kind === "percent") {
    unitFinal = Math.max(0, Math.round(p * (1 - disc.value / 100) * 100) / 100);
  } else {
    unitFinal = Math.max(0, Math.round((p - disc.value) * 100) / 100);
  }

  const unitOriginal = p;
  const percentOff = disc.kind === "percent" ? disc.value : (p === 0 ? 0 : Math.round((disc.value / p) * 100));
  const label = disc.kind === "percent" ? `-%${disc.value}` : `-${disc.value}₺`;

  return { has: unitFinal < unitOriginal, unitFinal, unitOriginal, percentOff, label };
}
