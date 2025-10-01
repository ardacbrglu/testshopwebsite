import "./globals.css";

export const metadata = { title: "Test Shop" };

import Link from "next/link";
import { ToastProvider } from "@/components/Toast";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-black text-white">
        <ToastProvider>
          <header className="border-b border-neutral-800">
            <nav className="max-w-6xl mx-auto p-4 flex items-center gap-6">
              <Link href="/" className="font-semibold">Test Shop</Link>
              <div className="flex-1" />
              <Link href="/">Anasayfa</Link>
              <Link href="/products">Ürünler</Link>
              <Link href="/cart">Sepetim</Link>
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
