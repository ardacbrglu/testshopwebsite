"use client";

import { useEffect, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

type CartItem = {
  id: number;
  productId: number;
  quantity: number;
  name: string;
  slug: string;
  price: number; // kuruş
  imageUrl: string;
};

export default function CartPage() {
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, number>>({}); // itemId -> qty

  const total = items.reduce(
    (acc, it) => acc + Number(it.price) * Number(it.quantity),
    0
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const j = await res.json();
      setEmail(j?.email ?? "");
      setItems(j?.items ?? []);
      setEdits({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveEmail() {
    const res = await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "E-posta kaydedilemedi");
    } else {
      alert("E-posta kaydedildi.");
    }
  }

  async function updateQty(itemId: number, quantity: number) {
    if (!quantity || quantity < 1) quantity = 1;
    const res = await fetch("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ itemId, quantity }),
    });
    if (res.ok) load();
  }

  async function removeItem(itemId: number) {
    const res = await fetch("/api/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ itemId }),
    });
    if (res.ok) load();
  }

  async function checkout() {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ email }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.ok) {
      alert(j?.error || "Checkout başarısız");
      return;
    }
    alert(`Sipariş oluşturuldu: ${j.orderNumber}`);
    load();
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Sepetim</h1>

      <div className="flex items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-posta adresinizi girin (zorunlu)"
          className="w-[360px] max-w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
        />
        <button
          onClick={saveEmail}
          className="rounded-xl px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 transition"
        >
          E-postayı Kaydet
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading && <div className="text-neutral-400">Yükleniyor…</div>}
        {!loading && items.length === 0 && (
          <div className="text-neutral-400">Sepetiniz boş.</div>
        )}
        {items.map((it) => {
          const currentQty = edits[it.id] ?? it.quantity;
          const lineTotal = Number(it.price) * Number(currentQty);
          return (
            <div
              key={it.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3"
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.imageUrl}
                  alt={it.slug}
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <div>
                  <div className="font-medium">{it.name}</div>
                  <div className="text-sm text-neutral-400">
                    Birim: {toCurrencyTRY(it.price)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={currentQty}
                  onChange={(e) =>
                    setEdits((m) => ({
                      ...m,
                      [it.id]: Math.max(1, Number(e.target.value || 1)),
                    }))
                  }
                  className="w-20 rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => updateQty(it.id, currentQty)}
                  className="rounded-lg px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500"
                >
                  Güncelle
                </button>
                <button
                  onClick={() => removeItem(it.id)}
                  className="rounded-lg px-3 py-2 text-sm bg-red-600 hover:bg-red-500"
                >
                  Kaldır
                </button>
              </div>

              <div className="text-sm">
                Toplam: <b>{toCurrencyTRY(lineTotal)}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-lg">
          Genel Toplam: <span className="font-semibold">{toCurrencyTRY(total)}</span>
        </div>
        <button
          onClick={checkout}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500"
        >
          Satın Al
        </button>
      </div>
    </main>
  );
}
