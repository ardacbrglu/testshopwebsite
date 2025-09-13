"use client";
import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";
import { useRouter } from "next/navigation";

const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const pct = (rule) => {
  const m = rule && String(rule).match(/-?\d+(\.\d+)?/);
  return m ? Math.max(0, Math.min(100, parseFloat(m[0]))) : null;
};

export default function CartPage() {
  const r = useRouter();
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const c = read("cart", []);
    setCart(c);
    const ids = c.map((x) => x.productId).join(",");
    Promise.all([
      ids ? fetch(`/api/products?ids=${ids}`).then((r) => r.json()) : Promise.resolve([]),
      fetch("/cabo").then((r) => r.json()).catch(() => ({})),
    ]).then(([prods, cfg]) => {
      setProducts(Array.isArray(prods) ? prods : []);
      setDiscounts(cfg?.discounts || {});
    }).finally(() => setLoading(false));
  }, []);

  const lines = useMemo(() => {
    return cart.map((it) => {
      const p = products.find((x) => x.id === it.productId);
      if (!p) return null;
      const shortKey = p.slug?.startsWith("product-") ? p.slug.slice(8) : p.slug?.split("-").pop();
      const rule = discounts[p.slug] ?? discounts[shortKey] ?? discounts[p.id] ?? null;
      const base = Number(p.price);
      const percent = pct(rule);
      const unit = percent != null ? +(base * (1 - percent / 100)).toFixed(2) : base;
      const quantity = Math.max(1, Number(it.quantity || 1));
      const line = +(unit * quantity).toFixed(2);
      return { ...p, quantity, unit, base, percent, line };
    }).filter(Boolean);
  }, [cart, products, discounts]);

  const subtotal = lines.reduce((s, l) => s + l.line, 0);

  const updateQty = (pid, q) => {
    const next = cart.map((c) => (c.productId === pid ? { ...c, quantity: Math.max(1, Number(q || 1)) } : c));
    setCart(next); write("cart", next);
  };
  const remove = (pid) => { const next = cart.filter((c) => c.productId !== pid); setCart(next); write("cart", next); };

  const checkout = async () => {
    const caboRef = localStorage.getItem("caboRef") || null;
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart, caboRef }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`Satın alma başarısız: ${j.error || "unknown"}`);
      return;
    }
    write("cart", []);
    r.push(`/orders?ok=1&ord=${encodeURIComponent(j.orderNumber || "")}`);
  };

  if (loading) return <div className="p-6">Yükleniyor…</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Sepetim</h1>
      {lines.length === 0 ? <p>Sepet boş.</p> : (
        <>
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.imageUrl} alt={l.name} className="w-20 h-16 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-neutral-400">
                    {l.percent != null ? (
                      <>
                        <span className="line-through mr-1">{toCurrencyTRY(l.base)}</span>
                        <span>{toCurrencyTRY(l.unit)} (-%{l.percent})</span>
                      </>
                    ) : (
                      <span>{toCurrencyTRY(l.base)}</span>
                    )}
                  </div>
                </div>
                <input type="number" min={1} className="input w-20" value={l.quantity}
                       onChange={(e) => updateQty(l.id, e.target.value)} />
                <div className="w-28 text-right">{toCurrencyTRY(l.line)}</div>
                <button className="btn" onClick={() => remove(l.id)}>Sil</button>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800 mt-6 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span>Ara Toplam</span><span>{toCurrencyTRY(subtotal)}</span>
            </div>
            <div className="flex items-center justify-end pt-2">
              <button className="btn" onClick={checkout}>Satın Al</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
