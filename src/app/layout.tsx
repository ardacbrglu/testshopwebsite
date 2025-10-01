// src/app/layout.tsx
import "./globals.css";
import Script from "next/script";
import NavBar from "@/components/NavBar";
import type { ReactNode } from "react";

export const metadata = {
  title: "Test Shop",
  description: "Demo e-ticaret",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        {/* Ref/consent/wid yakalayıp cookie'leri ayarlayan başlangıç scripti */}
        <Script src="/cabo-init.js" id="cabo-init" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-neutral-950 text-neutral-200">
        <header className="border-b border-neutral-900">
          <div className="container mx-auto px-4 py-4">
            <NavBar />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
