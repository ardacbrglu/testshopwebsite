// src/app/cart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ApiCartItem } from "@/lib/types";

type CartResp = {
  cartId: string;
  email: string | null;
  items: ApiCartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

function formatCentsTRY(cents: number) {
  const value = (Number(cents || 0) / 100).toFixed(2);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value));
}

export default function CartPage() {
  const [data, setData] = useState<CartResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrMsg(null);
    try {
      const r = await fetch("/api/cart", { cache: "no-store" });
      const j = (await r.json()) as unknown;
      if (!r.ok) throw new Error("CART_FETCH_FAILED");
      setData(j as CartResp);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "ERROR");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    return {
      subtotal: data?.subtotalCents ?? 0,
      discount: data?.discountCents ?? 0,
      total: data?.totalCents ?? 0,
    };
  }, [data]);

  async function updateQty(productId: number, quantity: number) {
    await fetch("/api/cart", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, quantity }),
    });
    await load();
  }

  async function remove(productId: number) {
    await fetch(`/api/cart?productId=${productId}`, { method: "DELETE" });
    await load();
  }

  async function checkout() {
    const r = await fetch("/api/checkout", { method: "POST" });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as unknown;
      const msg =typeof j === "object" && j !== null && "error" in j ? String((j as Record<string, unknown>).error): "CHECKOUT_FAILED"; 
      throw new Error(msg);
    }
    await load();
    alert("Checkout OK");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cart</h1>
        <Link href="/products" className="text-sm underline underline-offset-4">
          Continue shopping
        </Link>
      </div>

      {loading ? <div className="text-neutral-400">Loading...</div> : null}
      {errMsg ? <div className="text-red-400">Error: {errMsg}</div> : null}

      {data && !loading ? (
        <div className="space-y-4">
          {data.items.length === 0 ? (
            <div className="text-neutral-400">Your cart is empty.</div>
          ) : (
            data.items.map((it) => (
              <div
                key={it.productId}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-sm text-neutral-400">{it.slug}</div>
                    <div className="mt-2 text-sm">
                      Unit: {formatCentsTRY(it.finalUnitPriceCents)}
                      {it.discountPct > 0 ? (
                        <span className="ml-2 text-xs text-neutral-400 line-through">
                          {formatCentsTRY(it.unitPriceCents)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    onClick={() => void remove(it.productId)}
                    className="text-sm underline underline-offset-4 text-red-300"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void updateQty(it.productId, Math.max(0, it.quantity - 1))}
                      className="rounded-lg border border-neutral-700 px-3 py-1"
                    >
                      -
                    </button>
                    <div className="min-w-[32px] text-center">{it.quantity}</div>
                    <button
                      onClick={() => void updateQty(it.productId, it.quantity + 1)}
                      className="rounded-lg border border-neutral-700 px-3 py-1"
                    >
                      +
                    </button>
                  </div>

                  <div className="font-semibold">
                    {formatCentsTRY(it.lineFinalCents)}
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">Subtotal</span>
              <span>{formatCentsTRY(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-neutral-400">Discount</span>
              <span>-{formatCentsTRY(totals.discount)}</span>
            </div>
            <div className="flex items-center justify-between mt-3 text-lg font-semibold">
              <span>Total</span>
              <span>{formatCentsTRY(totals.total)}</span>
            </div>

            <button
              onClick={() => void checkout()}
              disabled={!data || data.items.length === 0}
              className="mt-4 w-full rounded-xl border border-neutral-700 px-4 py-3 hover:bg-neutral-900 disabled:opacity-60"
            >
              Checkout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}