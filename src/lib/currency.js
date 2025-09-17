// src/lib/currency.js
export function tryFromKurus(kurus) {
  const n = Number(kurus || 0) / 100;
  return n.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
