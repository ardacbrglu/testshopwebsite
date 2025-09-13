"use client";
import { useEffect, useState } from "react";
const DISPLAY_MS = 3000;
export default function WelcomeToast({ username }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("justLoggedIn") === "1") {
      sessionStorage.removeItem("justLoggedIn");
      setOpen(true);
      const t = setTimeout(() => setOpen(false), DISPLAY_MS);
      return () => clearTimeout(t);
    }
  }, []);
  if (!open) return null;
  return (
    <button onClick={() => setOpen(false)}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-emerald-600/40 bg-neutral-900/90 backdrop-blur px-4 py-2 text-sm">
      Hoş geldin, <span className="font-semibold">{username}</span>!
    </button>
  );
}
