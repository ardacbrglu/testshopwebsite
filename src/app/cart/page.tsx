"use client";

import { useEffect, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

type CartItemPayload = {
  id: number;
  productId: number;
  quantity: number;
  slug: string;
  name: string;
  imageUrl: string;
  product_code: string;

  unitPrice: number;        // kuruş
  discountPct: number;      // 0..90
  unitPriceAfter: number;   // kuruş

  lineGross: number;        // unitPrice * qty
  lineDiscount: number;     // lineGross - lineNet
  lineNet: number;          // unitPriceAfter * qty
};

type CartResponse = {
  cartId: number;
  email: string | null;
  items: CartItemPayload[];
  totals: { gross: number; discountTotal: number; net: number };
};

export default function CartPage() {
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<CartItemPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, number>>({}); // itemId -> qty
  const [totals, setTotals] = useState<{ gross: number; discountTotal: number; net: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const j = (await res.json()) as CartResponse;
      setEmail(j?.email ?? "");
      setItems(j?.items ?? []);
      setTotals(j?.totals ?? null);
      setEdits({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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
        {!loading && items.length === 0 && <div className="text-neutral-400">Sepetiniz boş.</div>}

        {items.map((it) => {
          const currentQty = edits[it.id] ?? it.quantity;
          const unitNow = it.discountPct > 0 ? it.unitPriceAfter : it.unitPrice;
          const lineGrossView = it.unitPrice * currentQty;
          const lineNetView = unitNow * currentQty;

          return (
            <div key={it.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.slug} className="w-16 h-16 rounded-lg object-cover" />
                <div>
                  <div className="font-medium">{it.name}</div>

                  {/* Birim fiyat */}
                  {it.discountPct > 0 ? (
                    <div className="text-sm text-neutral-300">
                      Birim: <span className="line-through text-neutral-400">{toCurrencyTRY(it.unitPrice)}</span>{" "}
                      <b>{toCurrencyTRY(it.unitPriceAfter)}</b> <span className="text-emerald-400">-%{it.discountPct}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-300">Birim: {toCurrencyTRY(it.unitPrice)}</div>
                  )}
                </div>
              </div>

              {/* Adet + butonlar */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={currentQty}
                  onChange={(e) => setEdits((m) => ({ ...m, [it.id]: Math.max(1, Number(e.target.value || 1)) }))}
                  className="w-20 rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
                />
                <button onClick={() => updateQty(it.id, currentQty)} className="rounded-lg px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500">
                  Güncelle
                </button>
                <button onClick={() => removeItem(it.id)} className="rounded-lg px-3 py-2 text-sm bg-red-600 hover:bg-red-500">
                  Kaldır
                </button>
              </div>

              {/* Satır toplamı */}
              <div className="text-sm">
                {it.discountPct > 0 ? (
                  <div className="flex items-baseline gap-2">
                    <span className="line-through text-neutral-400">{toCurrencyTRY(lineGrossView)}</span>
                    <b>{toCurrencyTRY(lineNetView)}</b>
                  </div>
                ) : (
                  <>Toplam: <b>{toCurrencyTRY(lineNetView)}</b></>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Özet */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-lg space-y-1">
          <div>Ara Toplam: <b>{toCurrencyTRY(totals?.gross ?? 0)}</b></div>
          <div>İndirim: <b className="text-emerald-400">- {toCurrencyTRY(totals?.discountTotal ?? 0)}</b></div>
          <div>Ödenecek: <span className="font-semibold">{toCurrencyTRY(totals?.net ?? 0)}</span></div>
        </div>
        <button onClick={checkout} className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500">
          Satın Al
        </button>
      </div>
    </main>
  );
}
