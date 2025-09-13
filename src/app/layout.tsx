import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Test Shop Sim",
  description: "Basit satın alma simülasyonu (Next.js + Prisma + MySQL)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-neutral-800 sticky top-0 z-50 bg-neutral-950/90 backdrop-blur">
          <div className="container h-16 flex items-center">
            <NavBar />
          </div>
        </header>

        <main className="container py-8">{children}</main>

        <footer className="border-t border-neutral-800 mt-16">
          <div className="container py-6 text-sm text-neutral-400">© Test Shop Sim</div>
        </footer>
      </body>
    </html>
  );
}
