// src/app/products/page.tsx
import Image from "next/image";
import { query } from "@/lib/db";
import { toCurrencyTRY } from "@/lib/format";
import { use } from "react";

async function getProducts() {
  return await query(
    "SELECT id, slug, name, description, price, imageUrl FROM products WHERE isActive = 1 ORDER BY id ASC"
  );
}

async function addToCart(productId: number, quantity: number) {
  "use server";
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/cart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ productId, quantity }),
  });
}

export default function ProductsPage() {
  const products = use(getProducts()) as any[];

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Ürünler</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </main>
  );
}

function ProductCard({ p }: { p: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-4 shadow">
      <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4 bg-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl} alt={p.name} className="object-cover w-full h-full" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-neutral-400">{p.slug}</div>
          <div className="text-lg font-medium">{p.name}</div>
          <div className="text-neutral-300 text-sm line-clamp-2 mt-1">{p.description}</div>
          <div className="text-primary-300 font-semibold mt-2">{toCurrencyTRY(p.price)}</div>
        </div>
      </div>

      <AddControls productId={p.id} />
    </div>
  );
}

function AddControls({ productId }: { productId: number }) {
  return (
    <form
      action={async (formData) => {
        "use server";
        const qty = Number(formData.get("qty") || 1);
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ productId, quantity: qty }),
        });
      }}
      className="mt-4 flex items-center gap-3"
    >
      <input
        name="qty"
        type="number"
        min={1}
        defaultValue={1}
        className="w-20 rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 transition"
      >
        Sepete Ekle
      </button>
    </form>
  );
}
