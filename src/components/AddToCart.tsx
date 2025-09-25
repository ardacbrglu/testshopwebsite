"use client";

import { useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

type Props = {
  productId: number;
  unitPrice: number;     // kuruş
  discountPct?: number;  // 0-90
};

export default function AddToCart({ productId, unitPrice, discountPct = 0 }: Props) {
  const [qty, setQty] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const effectiveUnit = useMemo(
    () => (discountPct > 0 ? unitPrice - Math.round(unitPrice * (discountPct / 100)) : unitPrice),
    [unitPrice, discountPct]
  );

  const fullTotal = useMemo(() => unitPrice * qty, [unitPrice, qty]);
  const discountedTotal = useMemo(() => effectiveUnit * qty, [effectiveUnit, qty]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ productId, quantity: qty }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j?.error || "Sepete eklenemedi");
      }
      alert("Ürün sepete eklendi.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Hata");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex items-center gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-neutral-800 px-2 py-2">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
          className="w-16 bg-transparent text-center outline-none"
        />
        {discountPct > 0 ? (
          <div className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-neutral-400 line-through">{toCurrencyTRY(fullTotal)}</span>
              <span className="font-semibold">{toCurrencyTRY(discountedTotal)}</span>
              <span className="text-emerald-400 text-xs">-%{discountPct}</span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-neutral-300">
            Toplam: <b>{toCurrencyTRY(fullTotal)}</b>
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-60 transition"
      >
        {busy ? "Ekleniyor..." : "Sepete Ekle"}
      </button>
    </form>
  );
}
