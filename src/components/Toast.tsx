"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type Toast = { id: number; type: "success" | "error" | "info"; title: string };
const Ctx = createContext<{ show: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now();
    setItems((xs) => [...xs, { id, ...t }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2500);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed right-4 bottom-4 space-y-2 z-50">
        {items.map((t) => (
          <div key={t.id} className={`px-3 py-2 rounded-lg border text-sm
            ${t.type === "success" ? "border-emerald-500 text-emerald-300" :
              t.type === "error" ? "border-red-500 text-red-300" :
              "border-neutral-600 text-neutral-200"}`}>
            {t.title}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}
