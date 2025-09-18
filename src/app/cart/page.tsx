// src/app/cart/page.tsx
import { query } from "@/lib/db";
import { getCartIdOptional } from "@/lib/cart";

type SearchParams = { [key: string]: string | string[] | undefined };

type CartItem = {
  cart_item_id: number;
  quantity: number;
  product_id: number;
  slug: string;
  name: string;
  price: number;      // integer kuruş
  imageUrl: string;
};

function fmtTRY(k: number) {
  const n = Number(k || 0) / 100;
  return n.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function CartPage({
  searchParams,
}: {
  // Next 15’te dynamic paramlar “await” istiyor; Promise veriyoruz
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const cartId = await getCartIdOptional();
  let email: string | null = null;
  let items: CartItem[] = [];

  if (cartId) {
    const row = (await query("SELECT email FROM carts WHERE id=? LIMIT 1", [
      cartId,
    ])) as Array<{ email: string | null }>;
    email = row[0]?.email || null;

    items = (await query(
      `SELECT ci.id AS cart_item_id, ci.quantity,
              p.id AS product_id, p.slug, p.name, p.price, p.imageUrl
       FROM cart_items ci JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=?
       ORDER BY ci.id DESC`,
      [cartId]
    )) as unknown as CartItem[];
  }

  const haveItems = items.length > 0;
  const subtotal = items.reduce(
    (s, i) => s + Number(i.price) * Number(i.quantity),
    0
  );

  // Toast mesajları (added/updated/removed/cleared/email/invalid_email)
  const toastScript = (() => {
    const map: Record<string, string> = {
      added: "Sepete eklendi.",
      updated: "Adet güncellendi.",
      removed: "Ürün sepetten silindi.",
      cleared: "Sepet temizlendi.",
      email: "E-posta kaydedildi.",
      invalid_email: "Geçersiz e-posta adresi.",
    };
    const key = (["added","updated","removed","cleared","email","invalid_email"] as const)
      .find((k) => sp?.[k]);
    if (!key) return "";
    const text = map[key];
    return `
      window.addEventListener("load",()=> {
        window.dispatchEvent(new CustomEvent("toast",{ detail:{ type:"success", text:${JSON.stringify(
          text
        )} } }));
        const url=new URL(location.href); url.searchParams.delete("${key}");
        history.replaceState(null,"",url.toString());
      });
    `;
  })();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Sepetim</h1>

      {!haveItems && <div className="text-neutral-400">Sepet boş.</div>}

      {haveItems && (
        <div className="space-y-4">
          {items.map((it) => (
            <div
              key={it.cart_item_id}
              className="flex items-center gap-4 p-4 rounded-xl bg-neutral-900 border border-neutral-800"
            >
              <img
                src={it.imageUrl}
                alt={it.name}
                className="w-24 h-24 object-cover rounded-lg"
              />
              <div className="flex-1">
                <div className="font-medium">{it.name}</div>
                <div className="text-neutral-400">{fmtTRY(it.price)}</div>
              </div>

              <form action="/api/cart" method="post" className="flex items-center gap-2">
                <input type="hidden" name="action" value="update" />
                <input type="hidden" name="cart_item_id" value={String(it.cart_item_id)} />
                <input
                  name="qty"
                  type="number"
                  min={1}
                  defaultValue={String(it.quantity)}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-1 w-20"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-white text-black text-sm cursor-pointer hover:opacity-90"
                >
                  Güncelle
                </button>
              </form>

              <form action="/api/cart" method="post">
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="cart_item_id" value={String(it.cart_item_id)} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm cursor-pointer hover:opacity-90"
                >
                  Sil
                </button>
              </form>
            </div>
          ))}

          <div className="flex justify-between items-center mt-4">
            <form action="/api/cart" method="post">
              <input type="hidden" name="action" value="clear" />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-neutral-800 text-white text-sm cursor-pointer hover:bg-neutral-700"
              >
                Sepeti temizle
              </button>
            </form>
            <div className="text-lg">
              Ara toplam: <b>{fmtTRY(subtotal)}</b>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <div className="font-medium mb-2">E-posta</div>
            <form action="/api/cart" method="post" className="flex items-center gap-2">
              <input type="hidden" name="action" value="set-email" />
              <input
                name="email"
                defaultValue={email ?? ""}
                placeholder="ornek@eposta.com"
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-white text-black text-sm cursor-pointer hover:opacity-90"
              >
                Kaydet
              </button>
            </form>
          </div>

          <form action="/api/checkout" method="post" className="mt-6">
            <input type="hidden" name="fromCart" value="1" />
            <button
              type="submit"
              className="px-4 py-3 rounded-xl bg-green-500 text-black font-medium cursor-pointer hover:opacity-90 disabled:opacity-40"
              disabled={!email || !haveItems}
            >
              Satın al
            </button>
            {!email && (
              <div className="text-sm text-red-400 mt-2">
                Satın almak için önce e-posta giriniz.
              </div>
            )}
          </form>
        </div>
      )}

      {toastScript && <script dangerouslySetInnerHTML={{ __html: toastScript }} />}
    </main>
  );
}
