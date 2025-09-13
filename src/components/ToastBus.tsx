"use client";
import { useEffect, useState } from "react";

export type ToastData = {
  id?: string;
  type?: "success" | "error" | "info";
  title: string;
  desc?: string;
  duration?: number;
};

export function emitToast(t: Omit<ToastData, "id">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("toast", { detail: t }));
}

export default function ToastBus() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    function onToast(e: any) {
      const id = crypto.randomUUID();
      const detail = e.detail as ToastData;
      const item = { id, ...detail };
      setToasts((s) => [...s, item]);
      const ms = detail.duration ?? 3000;
      const timer = setTimeout(() => {
        setToasts((s) => s.filter((x) => x.id !== id));
      }, ms);
      return () => clearTimeout(timer);
    }
    window.addEventListener("toast", onToast as EventListener);
    return () => window.removeEventListener("toast", onToast as EventListener);
  }, []);

  return (
    <div className="fixed z-[100] top-4 right-4 w-[calc(100%-2rem)] max-w-sm space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur px-4 py-3 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
                t.type === "error"
                  ? "bg-red-400"
                  : t.type === "success"
                  ? "bg-emerald-400"
                  : "bg-neutral-400"
              }`}
            />
            <div className="flex-1">
              <div className="font-medium">{t.title}</div>
              {t.desc ? (
                <div className="text-sm text-neutral-400">{t.desc}</div>
              ) : null}
            </div>
            <button
              aria-label="Kapat"
              onClick={() =>
                setToasts((s) => s.filter((x) => x.id !== t.id))
              }
              className="text-neutral-400 hover:text-neutral-200"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
