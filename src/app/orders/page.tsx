// src/app/orders/page.tsx
"use client";

import { useEffect, useState } from "react";

type OrderItem = { slug: string; name: string; quantity: number; unitPrice: number };
type PastOrder = { id: string; at: string; total: number; items: OrderItem[] };

function money(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

export default function OrdersPage() {
  const [email, setEmail] = useState<string>("");
  const [orders, setOrders] = useState<PastOrder[]>([]);
  const [loadedFor, setLoadedFor] = useState<string>("");

  useEffect(() => {
    const em = localStorage.getItem("customer_email") || "";
    setEmail(em);
    if (em) loadOrders(em);
  }, []);

  const loadOrders = (em: string) => {
    const key = `orders_by_email:${em.trim().toLowerCase()}`;
    try {
      const raw = localStorage.getItem(key);
      const list = raw ? (JSON.parse(raw) as PastOrder[]) : [];
      setOrders(list);
      setLoadedFor(em);
    } catch {
      setOrders([]);
      setLoadedFor(em);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>

      <div className="mb-5 flex items-center gap-2">
        <input
          className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button
          className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10"
          onClick={() => loadOrders(email)}
        >
          Geçmişi Getir
        </button>
      </div>

      {!loadedFor ? (
        <p className="text-white/70">E-posta girip “Geçmişi Getir”e tıklayın.</p>
      ) : orders.length === 0 ? (
        <p className="text-white/70">
          <span className="font-semibold">{loadedFor}</span> için kayıt bulunamadı.
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60">
              <div className="px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <div className="font-mono text-sm truncate sm:w-48">{o.id}</div>
                  <div className="text-xs sm:text-sm text-neutral-400 sm:w-56">
                    {new Date(o.at).toLocaleString("tr-TR")}
                  </div>
                  <div className="sm:ml-auto font-semibold">{money(o.total)}</div>
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="divide-y divide-neutral-800">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <div>{it.name} × {it.quantity}</div>
                      <div className="text-neutral-300">{money(it.unitPrice * it.quantity)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
