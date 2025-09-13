"use client";
import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

// helpers
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const clampQty = (q) => Math.max(1, parseInt(q || "1", 10));

function parsePercent(rule) {
  if (!rule) return null;
  const m = String(rule).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const pct = parseFloat(m[0]);
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}
function applyPct(price, rule) {
  const pct = parsePercent(rule);
  if (pct == null) return { unit: price, pct: null };
  const unit = +(price * (1 - pct / 100)).toFixed(2);
  return { unit, pct };
}

export default function ProductDetailPage({ params, searchParams }) {
  const slug = params.slug;
  const token = searchParams?.token || null;
  const lid   = searchParams?.lid   || null;

  const [product, setProduct] = useState(null);
  const [discounts, setDiscounts] = useState({});
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  // verileri yükle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // ürün
        const pRes = await fetch(`/api/products?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
        const pJson = await pRes.json();
        const p = Array.isArray(pJson) ? pJson[0] : pJson;
        // indirim/codec map (server env -> /cabo)
        const cRes = await fetch("/cabo", { cache: "no-store" });
        const cJson = await cRes.json();
        if (!cancelled) {
          setProduct(p || null);
          setDiscounts(cJson?.discounts || {});
        }
      } catch {
        if (!cancelled) {
          setProduct(null);
          setDiscounts({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div className="p-6">Yükleniyor…</div>;
  if (!product) return <div className="p-6">Ürün bulunamadı.</div>;

  const base = num(product.price);
  const isNum = Number.isFinite(base);
  const shortKey = typeof product.slug === "string" && product.slug.startsWith("product-")
    ? product.slug.slice(8)
    : (typeof product.slug === "string" ? product.slug.split("-").pop() : null);

  const rule = discounts[product.slug] ?? discounts[shortKey] ?? discounts[product.id] ?? null;
  const { unit: unitAfter, pct } = applyPct(isNum ? base : 0, rule);

  const oldStr = isNum ? toCurrencyTRY(base) : "—";
  const newStr = isNum ? toCurrencyTRY(unitAfter) : "—";
  const totalStr = isNum ? toCurrencyTRY(+(unitAfter * qty).toFixed(2)) : "—";

  return (
    <div className="p-6 grid md:grid-cols-2 gap-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.imageUrl} alt={product.name} className="w-full rounded-xl object-cover" />
      <div>
        <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
        <p className="text-neutral-400 mb-4">{product.description}</p>

        <div className="mb-3">
          {isNum && pct != null ? (
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

        <label className="block text-sm mb-1">Adet</label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(clampQty(e.target.value))}
            className="input w-24"
          />
          <button
            className="btn"
            onClick={() => {
              const cart = JSON.parse(localStorage.getItem("cart") || "[]");
              const found = cart.find((x) => x.productId === product.id);
              if (found) found.quantity += qty;
              else cart.push({ productId: product.id, productSlug: product.slug, quantity: qty });
              localStorage.setItem("cart", JSON.stringify(cart));
              if (token) localStorage.setItem("caboRef", token);
              if (lid)   localStorage.setItem("caboLid", String(lid));
            }}
          >
            Sepete Ekle
          </button>
        </div>

        <div className="mt-3 text-sm text-neutral-300">
          Toplam: <span className="font-semibold">{totalStr}</span>{isNum && pct!=null ? <> <span className="text-green-400"> (-%{pct})</span></> : null}
        </div>
      </div>
    </div>
  );
}
