// Money & small helpers (server + client safe)
export function money(amount, currency = process.env.SHOP_CURRENCY || "TRY", locale = "tr-TR") {
  const n = Number(amount || 0);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

export function clampInt(n, min = 1, max = 999) {
  const v = Number.isFinite(+n) ? Math.floor(+n) : min;
  return Math.min(max, Math.max(min, v));
}

export function uid(prefix = "T") {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now()}${rnd}`; // e.g., T1726234123456abc123
}
