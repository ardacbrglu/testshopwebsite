import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AddToCart from "@/components/AddToCart";
import { toCurrencyTRY } from "@/lib/format";
import WelcomeToast from "@/components/WelcomeToast";

export default async function ProductsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const products = await prisma.product.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });

  return (
    <>
      <WelcomeToast username={user.username} />
      <div className="mb-6"><h1 className="text-xl font-semibold">Ürünler</h1></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((p) => (
          <div key={p.id} className="card p-4 flex flex-col">
            <Link href={`/products/${p.slug}`} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt={p.name} className="rounded-xl mb-3 w-full aspect-[3/2] object-cover" />
              <h3 className="font-semibold text-lg">{p.name}</h3>
            </Link>
            <p className="text-neutral-400 text-sm line-clamp-2 mb-3">{p.description}</p>
            <div className="mt-auto flex items-center justify-between">
              <span className="text-base">{toCurrencyTRY(p.price)}</span>
              <AddToCart productId={p.id} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
