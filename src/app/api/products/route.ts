import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Demo katalog (productCode zorunlu — Cabo için)
const CATALOG = [
  {
    slug: "product-a",
    name: "Product A",
    description: "Hafif, günlük kullanıma uygun demo ürün.",
    image: "/img/a.jpg",
    price: 229.99,
    currency: "TRY",
    contracted: true,
    productCode: "A001",
    discountPercent: 10, // caboRef olursa uygula
  },
  {
    slug: "product-b",
    name: "Product B",
    description: "Dayanıklı ve şık demo ürün.",
    image: "/img/b.jpg",
    price: 49999.99,
    currency: "TRY",
    contracted: true,
    productCode: "B001",
    discountPercent: 50,
  },
  {
    slug: "product-c",
    name: "Product C",
    description: "Kompakt boyut, yüksek performans.",
    image: "/img/c.jpg",
    price: 1999.99,
    currency: "TRY",
    contracted: false, // anlaşmasız -> indirim uygulanmaz, Cabo’ya da post etmeyiz
    productCode: "C000",
    discountPercent: 0,
  },
];

function priceWithDiscount(p: number, percent: number) {
  const x = Math.round(p * (1 - percent / 100) * 100) / 100;
  return x < 0 ? 0 : x;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  // ⬇⬇⬇ Next 15: cookies() -> await cookies()
  const store = await cookies();
  const token =
    store.get("caboRef")?.value ||
    store.get("cabo_ref")?.value ||
    null;

  const decorate = (base: any) => {
    const hasRef = Boolean(token);
    const percent = base.contracted && hasRef ? (base.discountPercent || 0) : 0;
    const unitOriginal = base.price;
    const unitFinal = percent > 0 ? priceWithDiscount(unitOriginal, percent) : unitOriginal;
    const discountLabel = percent > 0 ? `-%${percent}` : null;

    // client’a gerekli alanlar
    return {
      slug: base.slug,
      name: base.name,
      description: base.description,
      image: base.image,
      unitOriginal,
      unitFinal,
      discountLabel,
      currency: base.currency,
      contracted: base.contracted,
      // checkout için server-only bilgiler
      _productCode: base.productCode,
      _discountPercent: percent,
    };
  };

  if (slug) {
    const p = CATALOG.find((x) => x.slug === slug);
    if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ data: decorate(p) }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { data: CATALOG.map(decorate) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
