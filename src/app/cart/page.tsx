// src/app/cart/page.tsx
import { query } from "@/lib/db";
import { getOrCreateCartId } from "@/lib/cart";
import { toCurrencyTRY } from "@/lib/format";
import { cookies } from "next/headers";
import { use } from "react";

async function getCart() {
  const cartId = await getOrCreateCartId();
  const [cart] = await query("SELECT email FROM carts WHERE id = ?", [cartId]);
  const items = await query(
    `SELECT ci.id, ci.quantity,
            p.id as productId, p.name, p.slug, p.price, p.imageUrl
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?`,
    [cartId]
  );

  const total = items.reduce((acc: number, it: any) => acc + Number(it.price) * Number(it.quantity), 0);
  return { cartId, email: cart?.email ?? "", items, total };
}

export default function CartPage() {
  const data = use(getCart()) as any;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Sepetim</h1>

      <EmailForm initialEmail={data.email} />

      <div className="mt-6 space-y-3">
        {data.items.map((it: any) => (
          <CartRow key={it.id} it={it} />
        ))}
        {data.items.length === 0 && (
          <div className="text-neutral-400">Sepetiniz boş.</div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-lg">Toplam: <span className="font-semibold">{toCurrencyTRY(data.total)}</span></div>
        <CheckoutButton />
      </div>
    </main>
  );
}

function EmailForm({ initialEmail }: { initialEmail: string }) {
  return (
    <form
      action={async (formData) => {
        "use server";
        const email = String(formData.get("email") || "").trim();
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/cart`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ email }),
        });
      }}
      className="flex items-center gap-3"
    >
      <input
        name="email"
        type="email"
        required
        defaultValue={initialEmail}
        placeholder="E-posta adresinizi girin (zorunlu)"
        className="w-[360px] max-w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
      />
      <button className="rounded-xl px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 transition">
        E-postayı Kaydet
      </button>
    </form>
  );
}

function CartRow({ it }: { it: any }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/60 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.imageUrl} alt={it.slug} className="w-16 h-16 rounded-lg object-cover" />
        <div>
          <div className="font-medium">{it.name}</div>
          <div className="text-sm text-neutral-400">{toCurrencyTRY(it.price)}</div>
        </div>
      </div>

      <form
        action={async (fd) => {
          "use server";
          const qty = Number(fd.get("qty") || 1);
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/cart`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ itemId: it.id, quantity: qty }),
          });
        }}
        className="flex items-center gap-2"
      >
        <input
          name="qty"
          type="number"
          min={1}
          defaultValue={it.quantity}
          className="w-20 rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
        />
        <button className="rounded-lg px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500">Güncelle</button>
      </form>

      <form
        action={async () => {
          "use server";
          await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/cart`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ itemId: it.id }),
          });
        }}
      >
        <button className="rounded-lg px-3 py-2 text-sm bg-red-600 hover:bg-red-500">Kaldır</button>
      </form>
    </div>
  );
}

function CheckoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        // Email serverda kontrol ediliyor; yoksa 400 döner.
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error("Checkout başarısız");
      }}
    >
      <button className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500">
        Satın Al
      </button>
    </form>
  );
}
