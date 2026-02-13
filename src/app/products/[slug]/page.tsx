export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getProductBySlug } from "@/lib/queries";
import { cookies } from "next/headers";
import {
  readReferralCookie,
  type CookieStore,
  isReferralValid,
  type ReferralAttrib,
} from "@/lib/cookies";
import { applyDiscountsToItems } from "@/lib/discounter";
import { formatTRY } from "@/lib/money";
import AddToCartWidget from "@/components/AddToCartWidget";

const PLACEHOLDER = "https://placehold.co/800x600?text=Product";

function buildRenderReferral(searchParams?: Record<string, string | string[] | undefined>): ReferralAttrib | null {
  const token = typeof searchParams?.token === "string" ? searchParams.token.trim() : "";
  const lid = typeof searchParams?.lid === "string" ? searchParams.lid.trim() : "";
  const linkId = typeof searchParams?.linkId === "string" ? searchParams.linkId.trim() : "";
  const slug = typeof searchParams?.slug === "string" ? searchParams.slug.trim() : "";

  const effectiveLid = lid || linkId;

  if (!token || token.length < 16) return null;
  if (!effectiveLid) return null;

  const ts = Math.floor(Date.now() / 1000);
  return { token, lid: effectiveLid, slug: slug || null, ts };
}

function refToClient(ref: ReferralAttrib | null | undefined) {
  if (!ref?.token || !ref?.lid) return null;
  return { token: String(ref.token), lid: String(ref.lid) };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = (await searchParams) || {};

  const product = await getProductBySlug(slug);
  if (!product) return <div className="p-6">Ürün bulunamadı.</div>;

  const c = cookies() as unknown as CookieStore; // ✅ await YOK
  const refCookie = readReferralCookie(c);
  const refFromUrl = buildRenderReferral(sp);

  const ref = isReferralValid(refCookie) ? refCookie : refFromUrl;
  const enabled = isReferralValid(ref);

  let pct = 0;
  let final = product.priceCents;

  if (enabled && ref) {
    const one = applyDiscountsToItems(
      [
        {
          product_id: product.id,
          slug: product.slug,
          name: product.name,
          image_url: product.imageUrl || "",
          quantity: 1,
          unit_price_cents: product.priceCents,
        },
      ],
      { enabled, referral: ref }
    ).items[0];

    pct = one.discountPct;
    final = one.finalUnitPriceCents;
  }

  const img = product.imageUrl?.trim() ? product.imageUrl : PLACEHOLDER;

  return (
    <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={product.name} className="w-full rounded-2xl object-cover" />

      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-neutral-400">{product.description}</p>

        <div className="text-xl font-bold flex items-center gap-2">
          {pct > 0 ? (
            <>
              <span className="text-neutral-500 line-through">{formatTRY(product.priceCents)}</span>
              <span>{formatTRY(final)}</span>
              <span className="text-emerald-400 text-xs">%{pct} indirim</span>
            </>
          ) : (
            <span>{formatTRY(product.priceCents)}</span>
          )}
        </div>

        <AddToCartWidget slug={product.slug} productId={product.id} ref={refToClient(ref)} />
      </div>
    </div>
  );
}
