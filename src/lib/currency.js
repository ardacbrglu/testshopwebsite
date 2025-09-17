// src/lib/currency.js
export function toPriceTextTRY(intPrice) {
  // intPrice zaten tam sayı; sadece binlik ayırıcı ve "₺"
  const v = Number(intPrice || 0);
  return "₺ " + v.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}
