import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { toCurrencyTRY } from "@/lib/format";
import AddToCart from "@/components/AddToCart";

export default async function ProductDetail({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const p = await prisma.product.findUnique({ where: { slug: params.slug } });
  if (!p || !p.isActive) notFound();

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.imageUrl} alt={p.name} className="rounded-2xl w-full aspect-[4/3] object-cover card" />
      <div className="card p-6">
        <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
        <p className="text-neutral-300 mb-4">{p.description}</p>
        <div className="text-xl mb-6">{toCurrencyTRY(p.price)}</div>
        <AddToCart productId={p.id} />
      </div>
    </div>
  );
}
