"use client";

import { useState } from "react";
import QuantityStepper from "@/components/QuantityStepper";
import { useToast } from "@/components/Toast";

export default function AddToCartWidget({ slug }: { slug: string }) {
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const { show } = useToast();

  async function add() {
    setLoading(true);
    try {
      const r = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, quantity: qty }),
      });
      if (!r.ok) throw new Error();
      show({ type: "success", title: "Sepete eklendi" });
    } catch {
      show({ type: "error", title: "Sepete eklenemedi" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 flex items-center gap-3">
      <QuantityStepper value={qty} min={1} onChange={setQty} />
      <button
        onClick={add}
        disabled={loading}
        className="rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900 disabled:opacity-50"
      >
        Sepete Ekle
      </button>
    </div>
  );
}
