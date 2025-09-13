// src/app/products/[slug]/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toCurrencyTRY } from "@/lib/format";
import { emitToast } from "@/components/ToastBus";

function getCart() {
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
}
function setCart(items) { localStorage.setItem("cart", JSON.stringify(items)); }
const round2 = (n) => Math.round(n * 100) / 100;

function keyFromSlug(slug) {
  // "product-a" -> "a"
  const m = /-([a-z0-9]+)$/i.exec(slug || "");
  return (m?.[1] || slug || "").toLowerCase();
}

function applyDiscount(basePrice, spec) {
  if (!spec) return { unit: basePrice, badge: null };
  const s = String(spec).trim().toUpperCase();
  if (s.endsWith("%")) {
    const p = parseFloat(s);
    const unit = Math.max(0, round2(basePrice * (1 - p / 100)));
    return { unit, badge: `-${p}%` };
  }
  if (s.endsWith("TRY")) {
    const off = parseFloat(s);
    const unit = Math.max(0, round2(basePrice - off));
    return { unit, badge: `-${off}₺` };
  }
  return { unit: basePrice, badge: null };
}

export default function ProductPage({ params }) {
  const { slug } = params || {};
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [discountSpec, setDiscountSpec] = useState(null);

  // token / lid yakala ve localStorage'da tut (siparişte kullanacağız)
  useEffect(() => {
    const tk = sp.get("token");
    const lid = sp.get("lid");
    if (tk) localStorage.setItem("caboRef", tk);
    if (lid) localStorage.setItem("caboLid", lid);
  }, [sp]);

  // Ürün + indirim bilgilerini getir
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Ürün
        const res = await fetch(`/api/products?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        const data = await res.json();
        const p = Array.isArray(data) ? data[0] : data;
        if (!alive) return;
        setProduct(p || null);

        // İndirim haritası
        const conf = await fetch("/api/cabo", { cache: "no-store" }).then(r => r.json());
        const k = keyFromSlug(slug);
        setDiscountSpec(conf?.discounts?.[k] || null);
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const pricing = useMemo(() => {
    if (!product) return null;
    const { unit, badge } = applyDiscount(product.price, discountSpec);
    const discounted = unit < product.price;
    return { unit, badge, discounted };
  }, [product, discountSpec]);

  function addToCart() {
    if (!product || !pricing) return;
    const token = localStorage.getItem("caboRef") || null;
    const next = getCart();
    // Sepete indirimli birim fiyat yazıyoruz ki adet değişince doğru çarpsın
    const existing = next.find(x => x.productId === product.id && x.token === token);
    if (existing) {
      existing.quantity += qty;
    } else {
      next.push({
        productId: product.id,
        slug: product.slug,
        quantity: qty,
        unitPriceCharged: pricing.unit, // önemli
        token,                           // sipariş payload'ında kullanacağız
      });
    }
    setCart(next);
    emitToast({ type: "success", title: "Sepete eklendi", desc: `${product.name} x ${qty}` });
  }

  if (loading) return <div className="p-6">Yükleniyor…</div>;
  if (!product) return <div className="p-6">Ürün bulunamadı.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="grid md:grid-cols-2 gap-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt={product.name} className="w-full rounded-2xl object-cover" />
        <div className="bg-neutral-900 rounded-2xl p-6 md:p-8">
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <p className="text-neutral-300 mb-4">{product.description}</p>

          {pricing?.discounted ? (
            <div className="flex items-baseline gap-3 mb-4">
              <span className="line-through text-neutral-500 text-xl">{toCurrencyTRY(product.price)}</span>
              <span className="text-2xl font-extrabold">{toCurrencyTRY(pricing.unit)}</span>
              {pricing.badge && (
                <span className="px-2 py-0.5 rounded bg-emerald-700/30 border border-emerald-700 text-emerald-300 text-sm">
                  {pricing.badge}
                </span>
              )}
            </div>
          ) : (
            <div className="text-2xl font-extrabold mb-4">{toCurrencyTRY(product.price)}</div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={qty}
              className="input w-24"
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
            <button className="btn" onClick={addToCart}>Sepete Ekle</button>
          </div>
        </div>
      </div>
    </div>
  );
}
