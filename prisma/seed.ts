const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const items = [
    { slug: "a", name: "Product A", price: 1499, imageUrl: "https://picsum.photos/seed/a/600/400" },
    { slug: "b", name: "Product B", price: 2499, imageUrl: "https://picsum.photos/seed/b/600/400" },
    { slug: "c", name: "Product C", price: 3999, imageUrl: "https://picsum.photos/seed/c/600/400" },
    { slug: "d", name: "Product D", price: 999,  imageUrl: "https://picsum.photos/seed/d/600/400" },
    { slug: "e", name: "Product E", price: 2899, imageUrl: "https://picsum.photos/seed/e/600/400" },
    { slug: "f", name: "Product F", price: 5599, imageUrl: "https://picsum.photos/seed/f/600/400" },
    { slug: "g", name: "Product G", price: 899,  imageUrl: "https://picsum.photos/seed/g/600/400" }
  ];

  for (const it of items) {
    await prisma.product.upsert({
      where: { slug: it.slug },
      update: {},
      create: {
        slug: it.slug,
        name: it.name,
        description: `${it.name} — simple demo item for Test Shop.`,
        price: it.price,
        imageUrl: it.imageUrl
      }
    });
  }
  console.log("Seed completed.");
}

main().catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
