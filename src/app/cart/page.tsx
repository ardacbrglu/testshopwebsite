"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type StoredCartItem = { slug: string; quantity: number };
type Product = {
  slug: string; name: string; image: string; unitFinal: number;
  unitOriginal: number; discountLabel: string | null; currency: string;
};
type OrderItem = { slug: string; name: string; quantity: number; unitPrice: number };

type CheckoutSuccess = {
  ok: true;
  orderNumber: string;
  email: string;
  items: OrderItem[];
  summary: { total: number; itemCount: number };
  message?: string;
};
type CheckoutError = { ok: false; error?: string };
type CheckoutResponse = CheckoutSuccess | CheckoutError;

function isCheckoutSuccess(d: CheckoutResponse): d is CheckoutSuccess {
  return !!d && (d as CheckoutSuccess).ok === true;
}
function money(n: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function CartPage() {
  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [emailSaved, setEmailSaved] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cart");
      setCart(raw ? (JSON.parse(raw) as StoredCartItem[]) : []);
      const em = localStorage.getItem("customer_email") || "";
      setEmail(em);
      setEmailSaved(Boolean(em));
    } catch {
      setCart([]);
    }
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCatalog((d?.data ?? []) as Product[]))
      .catch(() => setCatalog([]));
  }, []);

  const rows = useMemo(() => {
    return cart
      .map((ci) => {
        const p = catalog.find((x) => x.slug === ci.slug);
        if (!p) return null;
        const line = Math.round(p.unitFinal * ci.quantity * 100) / 100;
        return { ...ci, product: p, line };
      })
      .filter(
        (x): x is { slug: string; quantity: number; product: Product; line: number } =>
          Boolean(x)
      );
  }, [cart, catalog]);

  const total = rows.reduce((s, r) => s + r.line, 0);
  const currency = rows[0]?.product.currency || "TRY";

  const setQty = (slug: string, q: number) => {
    q = Math.max(1, Math.floor(q || 1));
    const next = cart.map((c) => (c.slug === slug ? { ...c, quantity: q } : c));
    setCart(next);
    localStorage.setItem("cart", JSON.stringify(next));
  };

  const removeOne = (slug: string) => {
    const next = cart.filter((c) => c.slug !== slug);
    setCart(next);
    localStorage.setItem("cart", JSON.stringify(next));
  };

  const saveEmail = () => {
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setMsg("Lütfen geçerli bir e-posta girin.");
      return;
    }
    localStorage.setItem("customer_email", em);
    setEmailSaved(true);
    setMsg("E-posta kaydedildi.");
  };

  const checkout = async () => {
    const em = (localStorage.getItem("customer_email") || "").trim().toLowerCase();
    if (!em) { setMsg("Sipariş vermek için e-posta zorunludur."); return; }

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart, email: em }),
      });
      const data: CheckoutResponse = await res.json();

      if (!res.ok || !isCheckoutSuccess(data)) {
        const err = !res.ok ? `http_${res.status}` : (("error" in data && data.error) || "checkout_failed");
        throw new Error(err);
      }

      const key = `orders_by_email:${em}`;
      const list: Array<{ id: string; at: string; items: OrderItem[]; total: number }> =
        JSON.parse(localStorage.getItem(key) || "[]");
      list.unshift({
        id: data.orderNumber,
        at: new Date().toISOString(),
        items: data.items,
        total: data.summary.total,
      });
      localStorage.setItem(key, JSON.stringify(list));

      const keyAll = "orders";
      const orders: Array<{ id: string; total: number; at: string; email: string }> =
        JSON.parse(localStorage.getItem(keyAll) || "[]");
      orders.unshift({ id: data.orderNumber, total: data.summary.total, at: new Date().toISOString(), email: em });
      localStorage.setItem(keyAll, JSON.stringify(orders));

      setMsg("Satın alma tamamlandı. Sipariş numarası: " + data.orderNumber);
      localStorage.removeItem("cart");
      setCart([]);
    } catch (e: unknown) {
      setMsg(`Satın alma başarısız: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Sepetim</h1>

      <div className="mb-6 max-w-xl">
        <label className="block text-sm mb-1">E-posta (sipariş için zorunlu)</label>
        <div className="flex items-center gap-2">
          <input
            className="w-full rounded-xl border border-white/20 bg-black/40 px-3 py-2"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailSaved(false); }}
            placeholder="you@example.com"
          />
          <button className="rounded-xl border border-white/20 px-4 py-2 hover:bg-white/10" onClick={saveEmail}>
            Kaydet
          </button>
        </div>
        <p className="text-xs text-white/50 mt-1">
          Bu adresle sipariş geçmişinizi “Satın Alımlarım” sayfasından görebilirsiniz.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="text-white/70">
          Sepet boş. <Link href="/products" className="underline">Ürünlere dön</Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.slug} className="flex items-center gap-4 rounded-xl border border-white/10 p-3">
                <img src={r.product.image} alt={r.product.name} className="w-20 h-20 object-cover rounded-lg" />
                <div className="flex-1">
                  <div className="font-medium">{r.product.name}</div>
                  <div className="text-sm text-white/60">
                    {r.product.discountLabel ? (
                      <>
                        <span className="line-through mr-2">{money(r.product.unitOriginal, currency)}</span>
                        <span>{money(r.product.unitFinal, currency)}</span>
                        <span className="text-emerald-400 ml-2">({r.product.discountLabel})</span>
                      </>
                    ) : (
                      <span>{money(r.product.unitFinal, currency)}</span>
                    )}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  className="w-24 rounded-md border border-white/20 bg-black/40 px-2 py-1"
                  value={r.quantity}
                  onChange={(e) => setQty(r.slug, Math.max(1, Math.floor(+e.target.value || 1)))}
                />
                <div className="w-32 text-right font-medium">{money(r.line, currency)}</div>
                <button onClick={() => removeOne(r.slug)} className="rounded-lg border border-white/20 px-3 py-1 hover:bg-white/10">
                  Sil
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="text-lg">
              Ara Toplam: <span className="font-semibold">{money(total, currency)}</span>
            </div>
            <button
              disabled={busy || !emailSaved}
              onClick={checkout}
              className="rounded-xl border border-white/20 px-5 py-2 hover:bg-white/10 disabled:opacity-60"
              title={!emailSaved ? "Önce e-postayı kaydedin" : ""}
            >
              {busy ? "İşleniyor..." : "Satın Al"}
            </button>
          </div>

          {msg && <div className="mt-3 text-sm text-white/80">{msg}</div>}
        </>
      )}
    </div>
  );
}
