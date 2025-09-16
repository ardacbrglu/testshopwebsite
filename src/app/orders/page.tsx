"use client";

import { useEffect, useState } from "react";

type OrderItem = { id: string; name: string; slug: string; quantity: number; lineTotal: number };
type Order = { id: string; orderNumber: string; createdAt: string; total: number; items: OrderItem[] };

function money(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}

export default function OrdersPage() {
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("orderEmail");
    if (saved) setEmail(saved);
  }, []);

  const load = async () => {
    setErr(null);
    setOrders(null);
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr("Lütfen geçerli bir e-posta girin.");
      return;
    }
    localStorage.setItem("orderEmail", em);
    setLoading(true);
    try {
      const r = await fetch(`/api/orders?email=${encodeURIComponent(em)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "server_error");
      setOrders(j.orders as Order[]);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Satın Alımlarım</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="email"
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={load} className="btn">Göster</button>
      </div>

      {err && <div className="text-red-400 text-sm mb-3">{err}</div>}
      {loading && <div>Yükleniyor…</div>}

      {orders && orders.length === 0 && <div className="text-white/70">Kayıt bulunamadı.</div>}

      {orders && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="font-mono text-sm">{o.orderNumber}</div>
                <div className="text-xs text-neutral-400">{new Date(o.createdAt).toLocaleString("tr-TR")}</div>
                <div className="ml-auto font-semibold">{money(o.total)}</div>
              </div>
              <div className="px-4 pb-3 divide-y divide-neutral-800">
                {o.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between py-2">
                    <div className="text-sm">{it.name} × {it.quantity}</div>
                    <div className="text-sm text-neutral-300">{money(it.lineTotal)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
