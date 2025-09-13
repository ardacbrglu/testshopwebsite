"use client";
import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

// --- Indirim yardımcıları ---
function parsePercent(rule) {
  if (!rule) return null;
  const m = String(rule).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const pct = Math.max(0, Math.min(100, parseFloat(m[0])));
  return Number.isFinite(pct) ? pct : null;
}
function applyPercentDiscount(price, rule) {
  const pct = parsePercent(rule);
  if (pct == null) return { price, pct: null };
  const newPrice = +(price * (1 - pct / 100)).toFixed(2);
  return { price: newPrice, pct };
}

export default function ProductDetailPage({ params, searchParams }) {
  const slug = params.slug;
  const token = searchParams?.token || null;
  const lid   = searchParams?.lid   || null;

  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  // İndirim map'i: sadece NEXT_PUBLIC okur (client)
  const discountMap = useMemo(() => {
    try {
      const s = process.env.NEXT_PUBLIC_CABO_DISCOUNTS_JSON || "{}";
      return JSON.parse(s);
    } catch { return {}; }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => {
        const p = Array.isArray(data) ? data[0] : data;
        setProduct(p || null);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="p-6">Yükleniyor…</div>;
  if (!product) return <div className="p-6">Ürün bulunamadı.</div>;

  // Güvenli fiyat
  const basePrice = Number(product.price);
  const safeBase  = Number.isFinite(basePrice) ? basePrice : 0;

  // 'product-a' → 'a' kısa anahtar desteği (eski JSON'lar için)
  const shortKey = typeof product.slug === "string" && product.slug.startsWith("product-")
    ? product.slug.slice("product-".length)
    : (typeof product.slug === "string" ? product.slug.split("-").pop() : null);

  const rule =
    discountMap[product.slug] ??
    discountMap[shortKey] ??
    discountMap[product.id] ??
    null;

  const { price: discounted, pct } = applyPercentDiscount(safeBase, rule);

  const showOld  = Number.isFinite(safeBase) && pct != null;
  const showNew  = Number.isFinite(discounted);
  const oldStr   = Number.isFinite(safeBase) ? toCurrencyTRY(safeBase) : "—";
  const newStr   = showNew ? toCurrencyTRY(discounted) : "—";

  return (
    <div className="p-6 grid md:grid-cols-2 gap-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.imageUrl} alt={product.name} className="w-full rounded-xl object-cover" />

      <div>
        <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
        <p className="text-neutral-400 mb-4">{product.description}</p>

        <div className="mb-4">
          {showOld ? (
            <>
              <div className="text-neutral-400 line-through">{oldStr}</div>
              <div className="text-2xl font-extrabold">
                {newStr} <span className="text-green-400 text-base">(-%{pct})</span>
              </div>
            </>
          ) : (
            <div className="text-2xl font-extrabold">{oldStr}</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e)=>setQty(Math.max(1, parseInt(e.target.value||"1",10)))}
            className="input w-24"
          />
          <button
            className="btn"
            onClick={()=>{
              // Sepete ekle
              const cart = JSON.parse(localStorage.getItem("cart")||"[]");
              const idx = cart.findIndex(x=>x.productId===product.id);
              if (idx>=0) cart[idx].quantity += qty;
              else cart.push({ productId: product.id, productSlug: product.slug, quantity: qty });
              localStorage.setItem("cart", JSON.stringify(cart));

              // ref bilgileri (checkout için)
              if (token) localStorage.setItem("caboRef", token);
              if (lid)   localStorage.setItem("caboLid", String(lid));
            }}
          >
            Sepete Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
