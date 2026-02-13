"use client";

import { useState } from "react";
import { useToast } from "./Toast";

export default function AddToCartWidget(props: {
  slug: string;
  productId: number;
  ref?: { token: string; lid: string } | null;
}) {
  const { slug, productId } = props;
  const [qty, setQty] = useState<number>(1);
  const { show } = useToast();

  async function add() {
    const r = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, productId, quantity: qty }),
    });
    if (r.ok) show({ type: "success", title: "Sepete eklendi" });
    else show({ type: "error", title: "Sepete eklenemedi" });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex items-center rounded-xl border border-neutral-700">
        <button className="px-3 py-2" onClick={() => setQty((q) => Math.max(1, q - 1))}>
          −
        </button>
        <div className="px-4 select-none">{qty}</div>
        <button className="px-3 py-2" onClick={() => setQty((q) => q + 1)}>
          +
        </button>
      </div>
      <button className="btn" onClick={add}>
        Sepete ekle
      </button>
    </div>
  );
}
