"use client";
import { useEffect } from "react";

/**
 * Ref linkten gelindiyse:
 * - middleware zaten cookie'ı yazdı; burada sadece sekme içi preview işaretleyip URL’i temizliyoruz.
 */
export default function CaboAttribution() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("token");
      const lid = url.searchParams.get("lid");

      if (token) {
        sessionStorage.setItem("cabo_preview", "1");
        if (lid) sessionStorage.setItem("cabo_lid", lid);
      }

      if (token || lid) {
        url.searchParams.delete("token");
        url.searchParams.delete("lid");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
  }, []);

  return null;
}
