import "./globals.css";

export const metadata = { title: "Test Shop" };

import Link from "next/link";
import { ToastProvider } from "@/components/Toast";

function buildRefQuery(sp?: Record<string, string | string[] | undefined>) {
  const token = typeof sp?.token === "string" ? sp.token.trim() : "";
  const lid = typeof sp?.lid === "string" ? sp.lid.trim() : "";
  const linkId = typeof sp?.linkId === "string" ? sp.linkId.trim() : "";
  const effectiveLid = lid || linkId;

  if (!token || token.length < 16 || !effectiveLid) return "";
  const t = encodeURIComponent(token);
  const l = encodeURIComponent(effectiveLid);
  return `?token=${t}&lid=${l}`;
}

export default async function RootLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const q = buildRefQuery(sp);

  return (
    <html lang="tr">
      <body className="bg-black text-white">
        <ToastProvider>
          <header className="border-b border-neutral-800">
            <nav className="max-w-6xl mx-auto p-4 flex items-center gap-6">
              <Link href="/" className="font-semibold">
                Test Shop
              </Link>
              <div className="flex-1" />
              <Link href={`/${q}`.replace("//", "/")}>Anasayfa</Link>
              <Link href={`/products${q}`}>Ürünler</Link>
              <Link href={`/cart${q}`}>Sepetim</Link>
            </nav>
          </header>

          <main className="min-h-[70vh]">{children}</main>

          <footer className="border-t border-neutral-800 text-neutral-400 text-sm p-6 text-center">
            © {new Date().getFullYear()} Test Shop
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
