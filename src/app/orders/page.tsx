"use client";

import { useEffect, useState } from "react";

type OrderRow = {
  id: string;
  at: string;
  total: number;
  email: string;
  items?: { slug: string; name: string; quantity: number; unitPrice: number }[];
};

export default function OrdersPage() {
  const [email, setEmail] = useState("");
  const [list, setList] = useState<OrderRow[]>([]);

  const load = () => {
    const em = email.trim().toLowerCase();
    const key = `orders_by_email:${em}`;
    const rows: OrderRow[] = JSON.parse(localStorage.getItem(key) || "[]");
    setList(rows);
  };

  useEffect(() => {
    const em = localStorage.getItem("customer_email") || "";
    setEmail(em);
    if (em) {
      const key = `orders_by_email:${em}`;
      const rows: OrderRow[] = JSON.parse(localStorage.getItem(key) || "[]");
      setList(rows);
    }
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>

      <div className="flex gap-2 mb-4">
        <input
          className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10" onClick={load}>
          Göster
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-white/70">Kayıt bulunamadı.</div>
      ) : (
        <div className="space-y-4">
          {list.map((o) => (
            <div key={o.id} className="rounded-xl border border-white/10 p-4">
              <div className="font-semibold">Sipariş #{o.id}</div>
              <div className="text-xs text-white/60">{new Date(o.at).toLocaleString("tr-TR")}</div>
              <div className="mt-2 text-sm text-white/80">Toplam: {o.total.toLocaleString("tr-TR")}</div>

              {o.items && o.items.length > 0 && (
                <ul className="mt-3 text-sm list-disc pl-5 space-y-1">
                  {o.items.map((it, idx) => (
                    <li key={idx}>
                      <b>{it.name}</b> × {it.quantity}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
