// src/components/PriceBlock.tsx
"use client";
import { useEffect, useMemo, useState } from "react";

function fmtTRY(k:number){return (Number(k||0)/100).toLocaleString("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:2});}

type Props = { unitPrice:number; unitDiscounted:number; discountPct:number; qtyInputId:string; };

export default function PriceBlock({ unitPrice, unitDiscounted, discountPct, qtyInputId }: Props) {
  const [qty, setQty] = useState(1);
  useEffect(() => {
    const el = document.getElementById(qtyInputId) as HTMLInputElement | null;
    if (!el) return;
    const handler = () => setQty(Math.max(1, parseInt(el.value||"1",10)));
    handler(); el.addEventListener("input", handler); el.addEventListener("change", handler);
    return () => { el.removeEventListener("input", handler); el.removeEventListener("change", handler); };
  }, [qtyInputId]);

  const totals = useMemo(() => {
    const full = unitPrice * qty;
    const disc = (discountPct>0 ? unitDiscounted : unitPrice) * qty;
    return { full, disc };
  }, [unitPrice, unitDiscounted, discountPct, qty]);

  if (discountPct>0) {
    return (
      <div className="space-y-1">
        <div className="text-sm text-green-400">Ref indirimi −{discountPct}%</div>
        <div className="text-xl">
          <span className="line-through text-neutral-500 mr-3">{fmtTRY(unitPrice)}</span>
          <span className="font-bold">{fmtTRY(unitDiscounted)}</span>
        </div>
        <div className="text-sm text-neutral-300">
          Toplam: <span className="line-through text-neutral-500 mr-2">{fmtTRY(totals.full)}</span>
          <span className="font-semibold">{fmtTRY(totals.disc)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-2xl">{fmtTRY(unitPrice)}</div>
      <div className="text-sm text-neutral-300">Toplam: <b>{fmtTRY(totals.disc)}</b></div>
    </div>
  );
}
