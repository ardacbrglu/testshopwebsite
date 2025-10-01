export function formatTRY(cents: number | null | undefined) {
  const v = typeof cents === "number" ? cents : 0;
  return (v / 100).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
}
