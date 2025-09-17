// components/ToastBus.tsx
"use client";
import { useEffect, useState } from "react";

export type ToastType = "info" | "success" | "error";
export interface ToastPayload { type?: ToastType; title?: string; desc?: string; duration?: number; }
export interface Toast extends Required<Omit<ToastPayload, "duration">> { id: string; duration: number; }

declare global { interface WindowEventMap { toast: CustomEvent<ToastPayload>; } }

export function emitToast(t: ToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>("toast", { detail: t }));
}

export default function ToastBus() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: WindowEventMap["toast"]) => {
      const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

      const d = e.detail ?? {};
      const item: Toast = {
        id,
        type: d.type ?? "info",
        title: d.title ?? "Bildirim",
        desc: d.desc ?? "",
        duration: Math.max(1000, d.duration ?? 3000),
      };

      setToasts((prev) => [...prev, item]);
      const timeout = window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), item.duration);

      const cleanup = () => {
        clearTimeout(timeout);
        setToasts((prev) => prev.filter((x) => x.id !== id));
        window.removeEventListener("visibilitychange", cleanup);
      };
      window.addEventListener("visibilitychange", cleanup, { once: true });
    };

    window.addEventListener("toast", handler);
    return () => window.removeEventListener("toast", handler);
  }, []);

  return (
    <div className="fixed z-[100] top-4 right-4 w-[calc(100%-2rem)] max-w-sm space-y-2">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur px-4 py-3 shadow-xl">
          <div className="flex items-start gap-3">
            <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
              t.type === "error" ? "bg-red-400" : t.type === "success" ? "bg-emerald-400" : "bg-neutral-400"
            }`} />
            <div className="flex-1">
              <div className="font-medium">{t.title}</div>
              {t.desc?.trim() ? <div className="text-sm text-neutral-400">{t.desc}</div> : null}
            </div>
            <button aria-label="Kapat" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-neutral-400 hover:text-neutral-200">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
