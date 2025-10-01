// src/app/page.tsx
import Link from "next/link";

type FeatureProps = { title: string; desc: string };
function Feature({ title, desc }: FeatureProps) {
  return (
    <div className="card p-4 text-left">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-neutral-400 text-sm mt-1">{desc}</div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <section className="min-h-[60vh] grid place-items-center">
      <div className="text-center max-w-3xl px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-300 mb-6">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          Live checkout simulator
        </div>

        <h1 className="font-semibold leading-tight text-4xl sm:text-5xl md:text-6xl">
          Test Shop{" "}
          <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Simulator
          </span>
        </h1>
        <p className="mt-4 text-neutral-300 text-base sm:text-lg">
          Ürünleri sepete ekle, “Satın Al” simülasyonunu çalıştır ve geçmişi e-posta ile görüntüle.
          Cabo entegrasyonuna hazır akış.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/products"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-5 py-3 font-medium bg-emerald-500/90 hover:bg-emerald-500 text-black transition"
          >
            Ürünlere Git
          </Link>
          <Link
            href="/cart"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-5 py-3 font-medium border border-neutral-700 hover:bg-neutral-900 transition"
          >
            Sepete Git
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Feature title="Basit Akış" desc="Ürün → Sepet → Satın Al → Geçmiş" />
          <Feature title="Gerçek Ödeme Yok" desc="Tamamen demo" />
          <Feature title="Cabo Hazır" desc="HMAC webhook + ref cookie" />
        </div>
      </div>
    </section>
  );
}
