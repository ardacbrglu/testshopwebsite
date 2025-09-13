"use client";
import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";
import { applyPercentDiscount } from "@/lib/discount";

export default function ProductDetailPage({ params, searchParams }) {
  const slug = params.slug;
  const token = searchParams?.token || null;
  const lid   = searchParams?.lid   || null;

  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);

  // Ürünü çek
  useEffect(() => {
    fetch(`/api/products?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(setProduct)
      .catch(() => setProduct(null));
  }, [slug]);

  // İndirim map'i (UI için NEXT_PUBLIC…; fallback CABO_DISCOUNTS_JSON)
  const discountMap = useMemo(() => {
    try {
      return JSON.parse(
        process.env.NEXT_PUBLIC_CABO_DISCOUNTS_JSON ||
        process.env.CABO_DISCOUNTS_JSON || "{}"
      );
    } catch { return {}; }
  }, []);

  if (!product) return <div className="p-6">Yükleniyor…</div>;

  const rule = discountMap[product.slug] || discountMap[product.id] || discountMap[slug] || null;
  const { price: discounted, pct } = applyPercentDiscount(product.price, rule);

  return (
    <div className="p-6 grid md:grid-cols-2 gap-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.imageUrl} alt={product.name} className="w-full rounded-xl object-cover"/>

      <div>
        <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
        <p className="text-neutral-400 mb-4">{product.description}</p>

        {/* Fiyat ve yüzde etiketi */}
        <div className="mb-4">
          {pct != null && pct > 0 ? (
            <>
              <div className="text-neutral-400 line-through">
                {toCurrencyTRY(product.price)}
              </div>
              <div className="text-2xl font-extrabold">
                {toCurrencyTRY(discounted)} <span className="text-green-400 text-base">(-%{pct})</span>
              </div>
            </>
          ) : (
            <div className="text-2xl font-extrabold">{toCurrencyTRY(product.price)}</div>
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
              const i = cart.findIndex(x=>x.productId===product.id);
              if (i>=0) cart[i].quantity += qty; else cart.push({ productId: product.id, quantity: qty, productSlug: product.slug });
              localStorage.setItem("cart", JSON.stringify(cart));
              // ref bilgilerini sakla (checkout'ta kullanılır)
              if (token) localStorage.setItem("caboRef", token);
              if (lid)   localStorage.setItem("caboLid", String(lid));
            }}
          >Sepete Ekle</button>
        </div>
      </div>
    </div>
  );
}
