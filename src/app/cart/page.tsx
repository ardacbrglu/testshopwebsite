// src/app/cart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ApiCartItem, ApiOrder } from "@/lib/types";
import CartLine from "@/components/CartLine";
import { formatTRY } from "@/lib/money";
import { useToast } from "@/components/Toast";

type CartResp = {
  cartId: string;
  email: string | null;
  items: ApiCartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  referral: null | { token: string; lid: number; scope: string; verifiedSlug: string | null; exp: number };
};

export default function CartPage() {
  const { show } = useToast();

  const [data, setData] = useState<CartResp | null>(null);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailDraft, setEmailDraft] = useState("");

  async function loadCart() {
    setLoading(true);
    try {
      const r = await fetch("/api/cart", { cache: "no-store" });
      const j = (await r.json()) as CartResp;
      setData(j);
      setEmailDraft(j.email || "");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders(email?: string) {
    const e = (email || "").trim();
    if (!e) {
      setOrders([]);
      return;
    }
    const r = await fetch(`/api/orders?email=${encodeURIComponent(e)}`, { cache: "no-store" });
    const j = (await r.json()) as { orders: ApiOrder[] };
    setOrders(Array.isArray(j.orders) ? j.orders : []);
  }

  useEffect(() => {
    void loadCart();
  }, []);

  useEffect(() => {
    if (data?.email) void loadOrders(data.email);
  }, [data?.email]);

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
    await loadCart();
  }

  async function remove(productId: number) {
    await fetch(`/api/cart?productId=${productId}`, { method: "DELETE" });
    await loadCart();
  }

  async function saveEmail() {
    const e = emailDraft.trim();
    const r = await fetch("/api/cart", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e }),
    });
    if (!r.ok) {
      show({ type: "error", title: "Email geçersiz / kaydedilemedi" });
      return;
    }
    show({ type: "success", title: "Email kaydedildi" });
    await loadCart();
    await loadOrders(e);
  }

  async function checkout() {
    const r = await fetch("/api/checkout", { method: "POST" });
    const j = await r.json().catch(() => null);

    if (!r.ok) {
      const msg = j && typeof j === "object" && "error" in j ? String((j as any).error) : "CHECKOUT_FAILED";
      show({ type: "error", title: msg });
      return;
    }

    show({ type: "success", title: "Checkout OK" });
    await loadCart();
    if (emailDraft.trim()) await loadOrders(emailDraft.trim());
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

      {data ? (
        <>
          <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm">
            <div>
              Referral:{" "}
              <span className={data.referral ? "text-emerald-300" : "text-neutral-400"}>
                {data.referral ? "ACTIVE" : "NONE"}
              </span>
            </div>
            {data.referral ? (
              <div className="mt-1 text-neutral-400">
                token: {data.referral.token.slice(0, 8)}… | lid: {data.referral.lid}
                {data.referral.verifiedSlug ? ` | verifiedSlug: ${data.referral.verifiedSlug}` : ""}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-sm text-neutral-400 mb-2">Checkout email (zorunlu)</div>
            <div className="flex gap-2">
              <input
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-xl border border-neutral-700 bg-transparent px-3 py-2"
              />
              <button onClick={saveEmail} className="rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
                Save
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            {data.items.length === 0 ? (
              <div className="text-neutral-400">Your cart is empty.</div>
            ) : (
              data.items.map((it) => (
                <CartLine
                  key={it.productId}
                  item={it}
                  onQuantityChange={(next) => void updateQty(it.productId, next)}
                  onRemove={() => void remove(it.productId)}
                />
              ))
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">Subtotal</span>
              <span>{formatTRY(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-neutral-400">Discount</span>
              <span>-{formatTRY(totals.discount)}</span>
            </div>
            <div className="flex items-center justify-between mt-3 text-lg font-semibold">
              <span>Total</span>
              <span>{formatTRY(totals.total)}</span>
            </div>

            <button
              onClick={() => void checkout()}
              disabled={!data || data.items.length === 0}
              className="mt-4 w-full rounded-xl border border-neutral-700 px-4 py-3 hover:bg-neutral-900 disabled:opacity-60"
            >
              Checkout
            </button>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-semibold">Order History</h2>
            <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
              {orders.length === 0 ? (
                <div className="text-neutral-400 text-sm">No orders for this email.</div>
              ) : (
                <div className="space-y-4">
                  {orders.map((o) => (
                    <div key={o.id} className="rounded-xl border border-neutral-800 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-neutral-400">#{o.id}</div>
                        <div className="font-semibold">{formatTRY(o.totalCents)}</div>
                      </div>
                      <div className="mt-2 text-xs text-neutral-500">{new Date(o.createdAt).toLocaleString("tr-TR")}</div>
                      <div className="mt-2 text-sm text-neutral-300">
                        {o.items.map((it) => (
                          <div key={`${o.id}-${it.slug}`} className="flex justify-between">
                            <span>{it.name} × {it.quantity}</span>
                            <span>{formatTRY(it.lineFinalCents)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}