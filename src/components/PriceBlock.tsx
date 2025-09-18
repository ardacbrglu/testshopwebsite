// src/components/PriceBlock.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

function fmtTRY(kurus: number) {
  const n = (Number(kurus || 0) / 100);
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  unitPrice: number;       // kuruş
  unitDiscounted: number;  // kuruş (yoksa unitPrice ile aynı gönder)
  discountPct: number;     // 0 ise indirim yok
  qtyInputId: string;      // sayfadaki adet inputunun id'si
};

export default function PriceBlock({ unitPrice, unitDiscounted, discountPct, qtyInputId }: Props) {
  const [qty, setQty] = useState<number>(1);

  useEffect(() => {
    const el = document.getElementById(qtyInputId) as HTMLInputElement | null;
    if (!el) return;
    const handler = () => {
      const v = Math.max(1, parseInt(el.value || "1", 10));
      setQty(v);
    };
    handler();
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
    return () => {
      el.removeEventListener("input", handler);
      el.removeEventListener("change", handler);
    };
  }, [qtyInputId]);

  const totals = useMemo(() => {
    const tFull = unitPrice * qty;
    const tDisc = (discountPct > 0 ? unitDiscounted : unitPrice) * qty;
    return { tFull, tDisc };
  }, [unitPrice, unitDiscounted, discountPct, qty]);

  if (discountPct > 0) {
    return (
      <div className="space-y-1">
        <div className="text-sm text-green-400">Ref indirimi −{discountPct}%</div>
        <div className="text-xl">
          <span className="line-through text-neutral-500 mr-3">{fmtTRY(unitPrice)}</span>
          <span className="font-bold">{fmtTRY(unitDiscounted)}</span>
        </div>
        <div className="text-sm text-neutral-300">
          Toplam: <span className="line-through text-neutral-500 mr-2">{fmtTRY(totals.tFull)}</span>
          <span className="font-semibold">{fmtTRY(totals.tDisc)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-2xl">{fmtTRY(unitPrice)}</div>
      <div className="text-sm text-neutral-300">Toplam: <b>{fmtTRY(totals.tDisc)}</b></div>
    </div>
  );
}
