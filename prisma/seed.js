// prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const items = [
  {
    name: "Product A",
    slug: "product-a",
    description: "Hafif, günlük kullanıma uygun demo ürün.",
    imageUrl:
      "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop",
    price: 2999,
  },
  {
    name: "Product B",
    slug: "product-b",
    description: "Dayanıklı ve şık demo ürün.",
    imageUrl:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop",
    price: 4999,
  },
  {
    name: "Product C",
    slug: "product-c",
    description: "Kompakt boyut, yüksek performans.",
    imageUrl:
      "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=1200&auto=format&fit=crop",
    price: 1999,
  },
  {
    name: "Product D",
    slug: "product-d",
    description: "Pratik, taşınabilir demo ürün.",
    imageUrl:
      "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?q=80&w=1200&auto=format&fit=crop",
    price: 2599,
  },
  {
    name: "Product E",
    slug: "product-e",
    description: "Günlük işlerin vazgeçilmezi.",
    imageUrl:
      "https://images.unsplash.com/photo-1520975922215-230f6c756dc9?q=80&w=1200&auto=format&fit=crop",
    price: 3499,
  },
  {
    name: "Product F",
    slug: "product-f",
    description: "Uzun ömürlü, hesaplı çözüm.",
    imageUrl:
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop",
    price: 3999,
  },
  {
    name: "Product G",
    slug: "product-g",
    description: "Sade ve minimalist tasarım.",
    imageUrl:
      "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1200&auto=format&fit=crop",
    price: 1599,
  },
];

async function main() {
  for (const it of items) {
    await prisma.product.upsert({
      where: { slug: it.slug },
      update: { ...it, isActive: true },
      create: it,
    });
  }
  console.log(`✅ Seed tamam: ${items.length} ürün yüklendi.`);
}

main()
  .catch((e) => {
    console.error("Seed hatası:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
