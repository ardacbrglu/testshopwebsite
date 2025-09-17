// src/components/CaboAttribution.tsx
"use client";

import { useEffect } from "react";

/**
 * Ref linkten gelindiyse:
 * - attribution cookie (caboRef) kurulur (30 gün)
 * - sadece bu sekmede indirim göstermek için sessionStorage.cabo_preview=1
 * - lid varsa sekme bazlı saklanır (opsiyonel)
 * - token/lid URL'den temizlenir
 */
export default function CaboAttribution() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("token");
      const lid = url.searchParams.get("lid"); // <-- artık kullanıyoruz

      if (token) {
        const maxAge = 30 * 24 * 60 * 60; // 30 gün
        document.cookie = [
          `caboRef=${encodeURIComponent(token)}`,
          `Max-Age=${maxAge}`,
          "Path=/",
          "SameSite=Lax",
          window.location.protocol === "https:" ? "Secure" : "",
        ]
          .filter(Boolean)
          .join("; ");

        // indirim sadece bu sekmede görünsün
        sessionStorage.setItem("cabo_preview", "1");

        // lid'i da sekme bazlı tut (isterseniz raporlamada kullanırsınız)
        if (lid) sessionStorage.setItem("cabo_lid", lid);
      }

      // URL'i temizle (UX)
      if (token || lid) {
        url.searchParams.delete("token");
        url.searchParams.delete("lid");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* yut */
    }
  }, []);

  return null;
}
