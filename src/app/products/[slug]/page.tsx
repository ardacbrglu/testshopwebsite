/* eslint-disable @next/next/no-img-element */
import { query } from "@/lib/db";
import { activeDiscountPctForSlugServer, calcDiscountedUnitPrice } from "@/lib/attribution";
import CaboEnsureLanding from "@/components/CaboEnsureLanding";
import AddToCart from "@/components/AddToCart";

function readEnvClean(v?: string | null): string {
  const raw = v ?? "";
  const noQuotes = raw.replace(/^['"]|['"]$/g, "");
  const noInline = noQuotes.replace(/\s+#.*$/, "");
  return noInline.trim();
}

function isLanding(): boolean {
  return readEnvClean(process.env.CABO_ATTRIBUTION_SCOPE).toLowerCase() === "landing";
}

function ttlDays(): number {
  const n = Number(readEnvClean(process.env.CABO_COOKIE_TTL_DAYS));
  return Number.isFinite(n) && n > 0 ? n : 14;
}

type Row = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price: number; // kuruş
  imageUrl: string;
};

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  const rows = (await query(
    "SELECT id, slug, name, description, price, imageUrl FROM products WHERE slug=? LIMIT 1",
    [slug]
  )) as Row[];

  if (!rows.length) {
    return <div className="container mx-auto p-6">Ürün bulunamadı.</div>;
  }
  const p = rows[0];

  const pct = await activeDiscountPctForSlugServer(slug);
  const { finalPrice, applied } = calcDiscountedUnitPrice(Number(p.price), pct);

  return (
    <main className="container mx-auto px-4 py-8">
      {/* landing modunda slug çerezini garantiye al */}
      <CaboEnsureLanding slug={slug} landing={isLanding()} ttlDays={ttlDays()} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <img src={p.imageUrl} alt={p.name} className="w-full rounded-xl object-cover" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
          {p.description ? <p className="text-neutral-300 mb-4">{p.description}</p> : null}

          <div className="mb-4 text-xl">
            {applied ? (
              <div className="flex items-baseline gap-3">
                <span className="line-through text-neutral-500">₺{(Number(p.price) / 100).toFixed(2)}</span>
                <span className="font-bold text-emerald-400">₺{(finalPrice / 100).toFixed(2)}</span>
                <span className="text-sm text-emerald-400">-%{pct}</span>
              </div>
            ) : (
              <span className="font-bold">₺{(Number(p.price) / 100).toFixed(2)}</span>
            )}
          </div>

          <AddToCart productId={Number(p.id)} unitPrice={finalPrice} />
        </div>
      </div>
    </main>
  );
}
