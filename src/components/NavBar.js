// components/NavBar.js
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const Icon = {
  Home: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
      <path fill="currentColor" d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3z" />
    </svg>
  ),
  Grid: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
      <path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
    </svg>
  ),
  Cart: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
      <path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7.1 6h14l-2 8H8.2L6.4 4H3V2h4l.6 4Z" />
    </svg>
  ),
  Receipt: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...p}>
      <path fill="currentColor" d="M7 2h10l2 2v18l-2-1-2 1-2-1-2 1-2-1-2 1V4l2-2Zm2 6h6v2H9V8Zm0 4h6v2H9v-2Z" />
    </svg>
  ),
};

function NavLink({ href, children, onClick }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`hover:underline underline-offset-4 flex items-center gap-2 ${active ? "text-neutral-50" : "text-neutral-300"}`}
    >
      {children}
    </Link>
  );
}

export default function NavBar() {
  const [open, setOpen] = useState(false);

  const Links = () => (
    <>
      <NavLink href="/" onClick={() => setOpen(false)}>
        <Icon.Home /> Anasayfa
      </NavLink>
      <NavLink href="/products" onClick={() => setOpen(false)}>
        <Icon.Grid /> Ürünler
      </NavLink>
      <NavLink href="/cart" onClick={() => setOpen(false)}>
        <Icon.Cart /> Sepetim
      </NavLink>
      <NavLink href="/orders" onClick={() => setOpen(false)}>
        <Icon.Receipt /> Satın Alımlarım
      </NavLink>
    </>
  );

  return (
    <div className="w-full flex items-center justify-between" suppressHydrationWarning>
      <Link href="/" className="font-semibold">Test Shop</Link>

      <nav className="hidden md:flex items-center gap-5">
        <Links />
      </nav>

      <button
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-neutral-700"
        onClick={() => setOpen(v => !v)}
        aria-label="Menü"
      >
        <div className="relative w-5 h-5">
          <span className={`absolute left-0 right-0 h-[2px] bg-neutral-300 transition ${open ? "top-2.5 rotate-45" : "top-1"}`} />
          <span className={`absolute left-0 right-0 h-[2px] bg-neutral-300 transition ${open ? "opacity-0" : "top-2.5"}`} />
          <span className={`absolute left-0 right-0 h-[2px] bg-neutral-300 transition ${open ? "top-2.5 -rotate-45" : "top-4"}`} />
        </div>
      </button>

      {open && (
        <div className="md:hidden absolute left-0 right-0 top-16 z-40 border-b border-neutral-800 bg-neutral-950">
          <div className="container py-4 flex flex-col gap-3">
            <Links />
          </div>
        </div>
      )}
    </div>
  );
}
