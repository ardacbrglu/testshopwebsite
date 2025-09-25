// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import NavBar from "@/components/NavBar";
import ToastBus from "@/components/ToastBus";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Test Shop Sim",
  description: "Basit satış simülasyonu",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-neutral-900/80 sticky top-0 z-50 bg-neutral-950/80 backdrop-blur">
          <div className="container py-2">
            <NavBar />
          </div>
          
        </header>

        <ToastBus />

        <main className="container py-6">{children}</main>

        <footer className="container py-8 text-sm text-neutral-400">
          © Test Shop Sim
        </footer>
        
        <script defer src="/cabo-init.js"></script>

      </body>
    </html>
  );
}

