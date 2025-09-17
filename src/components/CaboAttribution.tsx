"use client";

import { useEffect } from "react";

export default function CaboAttribution() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("token");
      const lid = url.searchParams.get("lid");

      if (token) {
        // Sadece bu sekmede indirim görünsün
        sessionStorage.setItem("cabo_preview", "1");

        // Atribüsyon cookie (komisyon için server tarafında okunacak)
        const maxAge = 60 * 60 * 24 * 30; // 30 gün
        const secure = window.location.protocol === "https:" ? "; secure" : "";
        document.cookie = `caboRef=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;

        // URL’yi temizleyelim (token/lid kalmasın)
        url.searchParams.delete("token");
        url.searchParams.delete("lid");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* noop */
    }
  }, []);

  return null;
}
