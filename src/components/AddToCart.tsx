"use client";

import { useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

type Props = {
  productId: number;
  unitPrice: number; // kuruş
};

export default function AddToCart({ productId, unitPrice }: Props) {
  const [qty, setQty] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const total = useMemo(() => unitPrice * qty, [unitPrice, qty]);

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
      // Başarılı: burada istersen toast göster
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Hata";
      // eslint-disable-next-line no-alert
      alert(msg);
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
        <span className="text-sm text-neutral-300">
          Toplam: <b>{toCurrencyTRY(total)}</b>
        </span>
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
