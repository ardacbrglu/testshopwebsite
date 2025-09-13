export function toCurrencyTRY(cents) {
  return (cents / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
}
