"use client";

import { useEffect, useState } from "react";

type StoredOrder = { id: string; total: number; at: string };

function money(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

export default function Orders() {
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("orders");
      setOrders(raw ? (JSON.parse(raw) as StoredOrder[]) : []);
    } catch {
      setOrders([]);
    }
  }, []);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>
      {orders.length === 0 ? (
        <div className="text-white/70">Kayıt yok.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl border border-white/10 p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">Sipariş #{o.id}</div>
                <div className="text-xs text-white/60">{new Date(o.at).toLocaleString("tr-TR")}</div>
              </div>
              <div className="font-semibold">{money(o.total)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
