"use client";

import type { ApiCartItem } from "@/lib/types";
import { formatTRY } from "@/lib/money";
import QuantityStepper from "@/components/QuantityStepper";

export default function CartLine({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: ApiCartItem;
  onQuantityChange: (next: number) => void;
  onRemove: () => void;
}) {
  const hasDiscount = item.discountPct > 0;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-neutral-800 last:border-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl || ""} alt="" className="w-20 h-20 object-cover rounded-lg" />
      <div className="flex-1">
        <div className="font-medium">{item.name}</div>
        <div className="text-neutral-400 text-sm">Adet: {item.quantity}</div>
        <div className="flex items-center gap-2 mt-1">
          {hasDiscount && (
            <span className="text-neutral-500 line-through text-sm">
              {formatTRY(item.unitPriceCents)}
            </span>
          )}
          <span className="font-semibold">
            {formatTRY(item.finalUnitPriceCents)}
          </span>
          {hasDiscount && (
            <span className="text-emerald-400 text-xs">
              %{item.discountPct} indirim
            </span>
          )}
        </div>
      </div>
      <QuantityStepper value={item.quantity} onChange={onQuantityChange} />
      <button onClick={onRemove} className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-900">
        Kaldır
      </button>
    </div>
  );
}
