"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Product = {
  id: string; slug: string; name: string; description: string; image: string;
  unitOriginal: number; unitFinal: number; discountLabel: string | null; currency: string; contracted: boolean;
};

function money(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

export default function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [p, setP] = useState<Product | null>(null);
  const [q, setQ] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/products?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(r => r.json()).then(d => setP(d.data));
  }, [slug]);

  if (!p) return <div className="p-8">Yükleniyor…</div>;

  const add = () => {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const idx = cart.findIndex((c: any) => c.slug === p.slug);
    if (idx >= 0) cart[idx].quantity += q; else cart.push({ slug: p.slug, quantity: q });
    localStorage.setItem("cart", JSON.stringify(cart));
    setToast("Sepete eklendi");
    setTimeout(() => setToast(null), 1600);
  };

  const subtotal = Math.round(p.unitFinal * q * 100) / 100;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {toast && <div className="fixed top-6 right-6 z-50 rounded-lg bg-white/10 text-white px-4 py-2 shadow-lg">{toast}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <img src={p.image} alt={p.name} className="w-full h-72 object-cover rounded-2xl" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
          <p className="text-white/70 mb-4">{p.description}</p>

          <div className="flex items-center gap-2 mb-4">
            {p.discountLabel ? (
              <>
                <span className="line-through text-white/40">{money(p.unitOriginal, p.currency)}</span>
                <span className="font-semibold">{money(p.unitFinal, p.currency)}</span>
                <span className="text-emerald-400 text-sm">({p.discountLabel})</span>
              </>
            ) : <span className="font-semibold">{money(p.unitFinal, p.currency)}</span>}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <input type="number" min={1} className="w-24 rounded-md border border-white/20 bg-black/40 px-2 py-1"
              value={q} onChange={(e) => setQ(Math.max(1, Math.floor(+e.target.value || 1)))} />
            <button onClick={add} className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10">
              Sepete Ekle
            </button>
          </div>

          <div className="text-sm text-white/70">Ara Toplam: <span className="font-semibold text-white">{money(subtotal, p.currency)}</span></div>
          {p.contracted && <div className="mt-2 text-xs text-emerald-400">Cabo indirimli ürün</div>}
        </div>
      </div>
    </div>
  );
}
