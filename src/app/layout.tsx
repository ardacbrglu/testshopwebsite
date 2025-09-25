// src/app/layout.tsx
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "Test Shop",
  description: "Email ile sipariş kaydı, basit demo mağaza",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-900">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center">
            <NavBar />
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-4">
          {children}
        </div>
      </body>
    </html>
  );
}
