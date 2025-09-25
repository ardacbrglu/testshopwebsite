// src/lib/format.ts
export function toCurrencyTRY(minor: number) {
  // DB'de değerler kuruş cinsinden: 22999 -> ₺229,99
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((minor ?? 0) / 100);
}
