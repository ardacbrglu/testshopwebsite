// Yüzdesel indirim helper'ı (tek kaynak)
// "10%", "10", "50TRY", "50 tl" → sayısal kısmı yüzde kabul edilir.
// Hatalı/negatif/>100 ise indirim uygulanmaz.
export function parsePercent(rule) {
  if (!rule) return null;
  const m = String(rule).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const pct = Math.max(0, Math.min(100, parseFloat(m[0])));
  return Number.isFinite(pct) ? pct : null;
}

export function applyPercentDiscount(price, rule) {
  const pct = parsePercent(rule);
  if (pct == null) return { price, pct: null };
  const newPrice = +(price * (1 - pct / 100)).toFixed(2);
  return { price: newPrice, pct };
}
