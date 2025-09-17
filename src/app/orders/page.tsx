// app/orders/page.tsx
"use client";

import { useEffect, useState } from "react";

type ItemRow = { id: string; name: string; slug: string; quantity: number; lineTotal: number };
type OrderRow = { id: string; orderNumber: string; createdAt: string; total: number; items: ItemRow[] };

function money(n: number, currency = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n); }

export default function OrdersPage() {
  const [email, setEmail] = useState("");
  const [list, setList] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const em = localStorage.getItem("customer_email") || "";
    setEmail(em);
    if (em) void load(em);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (em?: string) => {
    setLoading(true);
    try {
      const E = (em ?? email).trim().toLowerCase();
      if (!E) { setList([]); return; }
      const r = await fetch(`/api/orders?email=${encodeURIComponent(E)}`, { cache: "no-store" });
      const d = await r.json();
      setList(d?.orders ?? []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>

      <div className="flex gap-2 mb-4">
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button className="btn" onClick={() => load()} disabled={loading}>{loading ? "Yükleniyor..." : "Göster"}</button>
      </div>

      {list.length === 0 ? (
        <div className="text-white/70">Kayıt bulunamadı.</div>
      ) : (
        <div className="space-y-4">
          {list.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="font-semibold">Sipariş #{o.orderNumber}</div>
              <div className="text-xs text-white/60">{new Date(o.createdAt).toLocaleString("tr-TR")}</div>
              <div className="mt-2 text-sm text-white/80">Toplam: {money(o.total)}</div>
              <ul className="mt-3 text-sm list-disc pl-5 space-y-1">
                {o.items.map((it) => (
                  <li key={it.id}><b>{it.name}</b> × {it.quantity} — {money(it.lineTotal)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
