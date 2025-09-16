export const dynamic = "force-dynamic";

export default function SuccessPage({ searchParams }: { searchParams: { ord?: string } }) {
  const ord = searchParams?.ord;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-3">Ödeme Başarılı</h1>
      {ord ? (
        <p className="text-white/80 mb-6">
          Sipariş numaranız: <span className="font-mono">{ord}</span>
        </p>
      ) : (
        <p className="text-white/80 mb-6">Sipariş oluşturuldu.</p>
      )}

      <div className="flex gap-3">
        <a href="/orders" className="btn">Satın Alımlarım</a>
        <a href="/products" className="btn">Alışverişe devam et</a>
      </div>

      {/* Not: Cabo S2S post’u güvenlik/idempotensi için /api/checkout içinde zaten yapıldı. */}
    </div>
  );
}
