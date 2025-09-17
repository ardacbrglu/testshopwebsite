"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Product = {
  slug: string;
  name: string;
  description: string;
  image: string;
  unitOriginal: number;
  unitFinal: number;
  discountLabel: string | null; // sadece preview açıkken dolu
  contracted: boolean;
  currency: string;
};

type StoredCartItem = { slug: string; quantity: number };

function money(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const hasPreview = typeof window !== "undefined" && sessionStorage.getItem("cabo_preview") === "1";
    fetch("/api/products", {
      cache: "no-store",
      headers: hasPreview ? { "x-cabo-preview": "1" } : undefined,
    })
      .then((r) => r.json())
      .then((d) => setItems((d?.data ?? []) as Product[]));
  }, []);

  const addToCart = (p: Product) => {
    const q = Math.max(1, Math.floor(qty[p.slug] || 1));
    const cart: StoredCartItem[] = JSON.parse(localStorage.getItem("cart") || "[]");
    const idx = cart.findIndex((c) => c.slug === p.slug);
    if (idx >= 0) cart[idx].quantity += q;
    else cart.push({ slug: p.slug, quantity: q });
    localStorage.setItem("cart", JSON.stringify(cart));
    setToast("Sepete eklendi");
    setTimeout(() => setToast(null), 1600);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Ürünler</h1>

      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-lg bg-white/10 text-white px-4 py-2 shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((p) => (
          <div key={p.slug} className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow hover:shadow-lg transition">
            <Link href={`/products/${p.slug}`}>
              {/* demo için <img>; prod'da next/image önerilir */}
              <img src={p.image} alt={p.name} className="w-full h-48 object-cover rounded-xl mb-3" />
            </Link>

            <div className="font-semibold">{p.name}</div>
            <div className="text-white/70 text-sm mb-3">{p.description}</div>

            <div className="flex items-center gap-2 mb-3">
              {p.discountLabel ? (
                <>
                  <span className="line-through text-white/40">{money(p.unitOriginal, p.currency)}</span>
                  <span className="font-semibold">{money(p.unitFinal, p.currency)}</span>
                  <span className="text-emerald-400 text-sm">({p.discountLabel})</span>
                </>
              ) : (
                <span className="font-semibold">{money(p.unitFinal, p.currency)}</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                className="w-20 rounded-md border border-white/20 bg-black/40 px-2 py-1"
                value={qty[p.slug] || 1}
                onChange={(e) => setQty((s) => ({ ...s, [p.slug]: Math.max(1, Math.floor(+e.target.value || 1)) }))}
              />
              <button onClick={() => addToCart(p)} className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10">
                Sepete Ekle
              </button>
              <Link href={`/products/${p.slug}`} className="ml-auto text-white/70 hover:text-white text-sm underline">
                Detay
              </Link>
            </div>

            {p.discountLabel && <div className="mt-2 text-xs text-emerald-400">Cabo indirimli ürün</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
