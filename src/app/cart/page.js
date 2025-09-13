"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toCurrencyTRY } from "@/lib/format";
import { emitToast } from "@/components/ToastBus";

/* ────────── localStorage helpers ────────── */
function readCart() {
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); }
  catch { return []; }
}
function writeCart(items) {
  localStorage.setItem("cart", JSON.stringify(items));
}

/* ────────── component ────────── */
export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState([]);           // [{ productId, quantity }]
  const [products, setProducts] = useState([]);   // API'den gelen ürün detayları
  const [loading, setLoading] = useState(true);

  // İlk yüklemede sepet + ürünleri çek
  useEffect(() => {
    const c = readCart();
    setCart(c);

    const ids = c.map(x => x.productId).join(",");
    const p = ids
      ? fetch(`/api/products?ids=${encodeURIComponent(ids)}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      : Promise.resolve([]);

    p.then(list => {
      setProducts(Array.isArray(list) ? list : []);
      setLoading(false);
    });
  }, []);

  // Satırları birleştir
  const lines = useMemo(() => {
    if (!Array.isArray(cart) || !Array.isArray(products)) return [];
    return cart.map(it => {
      const p = products.find(x => x.id === it.productId);
      if (!p) return null;
      const qty = Math.max(1, Number(it.quantity) || 1);
      const unitOrig = Number(p.price || 0);
      const unitDisc = Number(p.discountedPrice ?? unitOrig);
      const hasDiscount = unitDisc < unitOrig;
      const lineOrig = unitOrig * qty;
      const lineDisc = unitDisc * qty;

      return {
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        quantity: qty,
        unitOrig,
        unitDisc,
        hasDiscount,
        discountLabel: p.discountLabel || null,
        lineOrig,
        lineDisc,
      };
    }).filter(Boolean);
  }, [cart, products]);

  const subtotalDisc = useMemo(
    () => lines.reduce((sum, l) => sum + l.lineDisc, 0),
    [lines]
  );
  const subtotalOrig = useMemo(
    () => lines.reduce((sum, l) => sum + l.lineOrig, 0),
    [lines]
  );
  const anyDiscount = subtotalDisc < subtotalOrig;

  /* ────────── actions ────────── */
  function sync(next) { writeCart(next); setCart(next); }

  function updateQty(productId, nextQty) {
    const q = Math.max(1, Number(nextQty) || 1);
    sync(cart.map(c => c.productId === productId ? { ...c, quantity: q } : c));
  }

  function removeItem(productId) {
    sync(cart.filter(c => c.productId !== productId));
  }

  async function checkout() {
    if (!lines.length) return;

    const items = cart.map(c => ({ productId: c.productId, quantity: Math.max(1, Number(c.quantity) || 1) }));

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      emitToast({ type: "error", title: "Satın alma başarısız", desc: j.error || "Bilinmeyen hata" });
      return;
    }

    // sepeti boşalt & siparişlere yönlendir
    sync([]);
    router.push(`/orders?ok=1&ord=${encodeURIComponent(j.orderNumber || "")}`);
  }

  if (loading) return <div className="p-6">Yükleniyor…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Sepetim</h1>

      {lines.length === 0 ? (
        <div className="text-neutral-300">Sepet boş.</div>
      ) : (
        <>
          <div className="space-y-4">
            {lines.map(l => (
              <div key={l.id} className="flex items-center gap-4 border border-neutral-800 rounded-lg p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.imageUrl}
                  alt={l.name}
                  className="w-20 h-16 rounded-md object-cover bg-neutral-900"
                />

                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.name}</div>

                  {/* Fiyat satırı (birim) */}
                  <div className="text-sm mt-1">
                    {l.hasDiscount ? (
                      <>
                        <span className="text-neutral-400 line-through mr-2">
                          {toCurrencyTRY(l.unitOrig)}
                        </span>
                        <span className="font-semibold">{toCurrencyTRY(l.unitDisc)}</span>
                        {l.discountLabel ? (
                          <span className="ml-2 px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 text-[11px] border border-emerald-800 align-middle">
                            {l.discountLabel}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="font-semibold">{toCurrencyTRY(l.unitOrig)}</span>
                    )}
                    <span className="text-neutral-400 ml-2">× {l.quantity}</span>
                  </div>
                </div>

                {/* Adet */}
                <input
                  type="number"
                  min={1}
                  className="w-20 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-right"
                  value={l.quantity}
                  onChange={(e) => updateQty(l.id, e.target.value)}
                />

                {/* Satır toplamı */}
                <div className="w-32 text-right">
                  {l.hasDiscount ? (
                    <>
                      <div className="text-neutral-400 line-through text-sm">
                        {toCurrencyTRY(l.lineOrig)}
                      </div>
                      <div className="font-semibold">{toCurrencyTRY(l.lineDisc)}</div>
                    </>
                  ) : (
                    <div className="font-semibold">{toCurrencyTRY(l.lineOrig)}</div>
                  )}
                </div>

                <button
                  className="px-3 py-1 rounded-md border border-neutral-800 hover:bg-neutral-800"
                  onClick={() => removeItem(l.id)}
                >
                  Sil
                </button>
              </div>
            ))}
          </div>

          {/* toplamlar */}
          <div className="border-t border-neutral-800 mt-6 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">Ara Toplam</span>
              <div className="text-right">
                {anyDiscount ? (
                  <>
                    <div className="text-neutral-400 line-through text-sm">{toCurrencyTRY(subtotalOrig)}</div>
                    <div className="text-lg font-semibold">{toCurrencyTRY(subtotalDisc)}</div>
                  </>
                ) : (
                  <div className="text-lg font-semibold">{toCurrencyTRY(subtotalOrig)}</div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-black font-semibold"
                onClick={checkout}
              >
                Satın Al
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
