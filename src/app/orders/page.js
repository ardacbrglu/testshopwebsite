// src/app/orders/page.js
"use client";

import { useState } from "react";

function toCurrencyTRY(minor) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((minor ?? 0) / 100);
}

export default function OrdersPage() {
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?email=${encodeURIComponent(email)}`, { cache: "no-store" });
      const json = await res.json();
      setOrders(json.orders || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="E-posta adresini gir (kayıtlı siparişleri getir)"
          className="w-[360px] max-w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
        />
        <button className="rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 transition">
          {loading ? "Yükleniyor..." : "Siparişleri Getir"}
        </button>
      </form>

      <div className="mt-6 space-y-4">
        {orders.length === 0 && !loading && <div className="text-neutral-400">Kayıt bulunamadı.</div>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{o.orderNumber}</div>
              <div className="text-sm text-neutral-400">
                {new Date(o.createdAt).toLocaleString("tr-TR")}
              </div>
            </div>
            <div className="mt-2 text-sm text-neutral-300">
              Toplam: <b>{toCurrencyTRY(o.totalAmount)}</b>
              {o.discountTotal > 0 && (
                <span className="ml-3">
                  İndirim: <b>{toCurrencyTRY(o.discountTotal)}</b>
                </span>
              )}
            </div>
            <div className="mt-3 border-t border-white/10 pt-3 space-y-1">
              {o.items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div>
                    {it.product_name} <span className="text-neutral-400">x{it.quantity}</span>
                  </div>
                  <div>{toCurrencyTRY(it.unit_price)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
