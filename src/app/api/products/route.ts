import { NextResponse } from "next/server";

type CatalogItem = {
  slug: string;
  name: string;
  description: string;
  image: string;
  price: number;
  currency: string;
  contracted: boolean;
  productCode: string;
  discountPercent: number;
};

const CATALOG: CatalogItem[] = [
  { slug: "product-a", name: "Product A", description: "Hafif, günlük kullanıma uygun demo ürün.", image: "/img/a.jpg", price: 229.99,   currency: "TRY", contracted: true,  productCode: "A001", discountPercent: 10 },
  { slug: "product-b", name: "Product B", description: "Dayanıklı ve şık demo ürün.",               image: "/img/b.jpg", price: 50000.00, currency: "TRY", contracted: true,  productCode: "B001", discountPercent: 50 },
  { slug: "product-c", name: "Product C", description: "Kompakt boyut, yüksek performans.",          image: "/img/c.jpg", price: 1999.99,  currency: "TRY", contracted: false, productCode: "C000", discountPercent: 0  },
  { slug: "product-d", name: "Product D", description: "Pratik, taşınabilir demo ürün.",             image: "/img/d.jpg", price: 23750.00, currency: "TRY", contracted: true,  productCode: "D001", discountPercent: 5  },
  { slug: "product-e", name: "Product E", description: "Günlük işlerin vazgeçilmezi.",               image: "/img/e.jpg", price: 34.99,    currency: "USD", contracted: true,  productCode: "E001", discountPercent: 0  },
  { slug: "product-f", name: "Product F", description: "Uzun ömürlü, hesaplı çözüm.",                image: "/img/f.jpg", price: 100000.00,currency: "TRY", contracted: false, productCode: "F000", discountPercent: 0  },
];

function priceWithDiscount(p: number, percent: number) {
  const x = Math.round(p * (1 - percent / 100) * 100) / 100;
  return x < 0 ? 0 : x;
}

type ProductPayload = {
  slug: string;
  name: string;
  description: string;
  image: string;
  unitOriginal: number;
  unitFinal: number;
  discountLabel: string | null;
  currency: string;
  contracted: boolean;
  _productCode: string;
  _discountPercent: number;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  // Sadece bu header varsa indirim etiketi göster
  const preview = req.headers.get("x-cabo-preview") === "1";

  const decorate = (base: CatalogItem): ProductPayload => {
    const percent = base.contracted && preview ? base.discountPercent || 0 : 0;
    const unitOriginal = base.price;
    const unitFinal = percent > 0 ? priceWithDiscount(unitOriginal, percent) : unitOriginal;
    const discountLabel = percent > 0 ? `-%${percent}` : null;

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
      _productCode: base.productCode,
      _discountPercent: percent,
    };
  };

  if (slug) {
    const p = CATALOG.find((x) => x.slug === slug);
    if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ data: decorate(p) });
  }
  return NextResponse.json({ data: CATALOG.map(decorate) });
}
