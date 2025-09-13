import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { toCurrencyTRY } from "@/lib/format";
import AddToCart from "@/components/AddToCart";
import { cookies } from "next/headers";

function parseJSON(s, fb) { try { return JSON.parse(s || ""); } catch { return fb; } }
function shortKey(slug=""){ return slug.replace(/^product-/, "").replace(/^urun-/, "").replace(/^item-/, ""); }
function pick(map, keys=[]){ for(const k of keys){ if(k && Object.prototype.hasOwnProperty.call(map,k)) return map[k]; } }
function applyDiscount(price, spec){
  if (!spec) return { price, originalPrice: null };
  const s = String(spec).trim().toUpperCase();
  if (s.endsWith("%")) {
    const pct = Math.max(0, Math.min(100, parseFloat(s.slice(0,-1))||0));
    return { price: +(price*(1-pct/100)).toFixed(2), originalPrice: price };
  }
  const fixed = parseFloat(s.replace("TRY","").replace("TL",""))||0;
  return { price: Math.max(0, +(price-fixed).toFixed(2)), originalPrice: price };
}

export default async function ProductDetail({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const p = await prisma.product.findUnique({ where: { slug: params.slug } });
  if (!p || !p.isActive) notFound();

  const hasRef = !!(await cookies()).get("cabo_ref")?.value || !!searchParams?.token;
  const discMap = parseJSON(process.env.CABO_DISCOUNTS_JSON, {});
  const spec = pick(discMap, [p.slug, shortKey(p.slug), p.id]);
  const priced = hasRef ? applyDiscount(p.price, spec) : { price: p.price, originalPrice: null };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <img src={p.imageUrl} alt={p.name} className="rounded-2xl w-full aspect-[4/3] object-cover card" />
      <div className="card p-6">
        <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
        <p className="text-neutral-300 mb-4">{p.description}</p>

        <div className="text-xl mb-6">
          {priced.originalPrice
            ? (<><span className="line-through mr-2 opacity-60">{toCurrencyTRY(priced.originalPrice)}</span><b>{toCurrencyTRY(priced.price)}</b></>)
            : (<b>{toCurrencyTRY(priced.price)}</b>)
          }
        </div>

        <AddToCart productId={p.id} />
      </div>
    </div>
  );
}
