// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCaboConfig, applyDiscount, refFromRequest, isDiscountActiveFor } from "@/lib/cabo-integration";

export const dynamic = "force-dynamic";

type DbRow = {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;          // kuruş
  // currency kolonu yok → TRY sabit
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const { map, scope } = getCaboConfig();
  const ref = refFromRequest(req);

  const shape = (p: DbRow) => {
    const entry = map[p.slug];
    const contracted = Boolean(entry);
    const active = isDiscountActiveFor(p.slug, {
      scope,
      tokenActive: ref.active,
      landingSlug: ref.landingSlug,
      preview: ref.preview,
    });
    const d = contracted && active ? entry?.discount : undefined;
    const { final, label } = applyDiscount(p.price / 100, d);
    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      image: p.imageUrl || "/img/placeholder.jpg",
      unitOriginal: p.price / 100,
      unitFinal: final,
      discountLabel: label,
      currency: "TRY",     // ← sabit
      contracted,
    };
  };

  if (slug) {
    const p = (await prisma.product.findFirst({
      where: { slug, isActive: true },
      select: { slug: true, name: true, description: true, imageUrl: true, price: true },
    })) as DbRow | null;
    if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ data: shape(p) }, { headers: { "Cache-Control": "no-store" } });
  }

  const rows = (await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { slug: true, name: true, description: true, imageUrl: true, price: true },
  })) as DbRow[];

  return NextResponse.json({ data: rows.map(shape) }, { headers: { "Cache-Control": "no-store" } });
}
