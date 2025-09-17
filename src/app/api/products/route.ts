import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type CatalogItem = {
  slug: string;
  name: string;
  description: string;
  image: string;
  price: number;
  currency: string;
  contracted: boolean;     // anlaşmalı mı?
  productCode: string;     // Cabo için sabit dış ID
  discountPercent: number; // fallback indirim (env yoksa)
};

// Demo katalog — A,B,D anlaşmalı
const CATALOG: CatalogItem[] = [
  { slug: "product-a", name: "Product A", description: "Hafif, günlük kullanıma uygun demo ürün.", image: "/img/a.jpg", price: 229.99,   currency: "TRY", contracted: true,  productCode: "A001", discountPercent: 10 },
  { slug: "product-b", name: "Product B", description: "Dayanıklı ve şık demo ürün.",               image: "/img/b.jpg", price: 49999.99, currency: "TRY", contracted: true,  productCode: "B001", discountPercent: 50 },
  { slug: "product-c", name: "Product C", description: "Kompakt boyut, yüksek performans.",          image: "/img/c.jpg", price: 1999.99,  currency: "TRY", contracted: false, productCode: "C000", discountPercent: 0  },
  { slug: "product-d", name: "Product D", description: "Pratik, taşınabilir demo ürün.",              image: "/img/d.jpg", price: 23750.00, currency: "TRY", contracted: true,  productCode: "D001", discountPercent: 5  },
  { slug: "product-e", name: "Product E", description: "Günlük işlerin vazgeçilmezi.",                image: "/img/e.jpg", price: 34.99,    currency: "TRY", contracted: false, productCode: "E000", discountPercent: 0  },
  { slug: "product-f", name: "Product F", description: "Uzun ömürlü, hesaplı çözüm.",                 image: "/img/f.jpg", price: 100000.00,currency: "TRY", contracted: false, productCode: "F000", discountPercent: 0  },
];

function round2(n: number){ return Math.round(n*100)/100; }
function priceWithDiscount(p: number, percent: number) {
  const x = round2(p * (1 - percent / 100));
  return x < 0 ? 0 : x;
}
function parsePercent(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const m = v.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; }
  return 0;
}
function loadEnvDiscount(slug: string, code: string): number {
  try {
    const raw = process.env.CABO_DISCOUNTS_JSON || "{}";
    const j = JSON.parse(raw) as Record<string, unknown>;
    return parsePercent(j[slug] ?? j[code] ?? 0);
  } catch { return 0; }
}

type ProductPayload = {
  slug: string; name: string; description: string; image: string;
  unitOriginal: number; unitFinal: number; discountLabel: string | null;
  currency: string; contracted: boolean;
  _productCode: string; _discountPercent: number; // checkout kullanımına
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  // 🔧 Next 15 fix: cookies() -> await cookies()
  const cookieStore = await cookies();
  const token =
    cookieStore.get("caboRef")?.value ||
    cookieStore.get("cabo_ref")?.value ||
    null;

  const decorate = (base: CatalogItem): ProductPayload => {
    // İndirim önceliği: ENV > katalog fallback
    const envPct = loadEnvDiscount(base.slug, base.productCode);
    const pct = base.contracted && token ? (envPct || base.discountPercent || 0) : 0;
    const unitOriginal = base.price;
    const unitFinal = pct > 0 ? priceWithDiscount(unitOriginal, pct) : unitOriginal;

    return {
      slug: base.slug,
      name: base.name,
      description: base.description,
      image: base.image,
      unitOriginal,
      unitFinal,
      discountLabel: pct > 0 ? `-%${pct}` : null,
      currency: base.currency,
      contracted: base.contracted,
      _productCode: base.productCode,
      _discountPercent: pct,
    };
  };

  if (slug) {
    const p = CATALOG.find((x) => x.slug === slug);
    if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ data: decorate(p) });
  }
  return NextResponse.json({ data: CATALOG.map(decorate) });
}
