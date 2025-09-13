"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!form.identifier || !form.password) { setErr("Lütfen tüm alanları doldurun."); return; }
    try {
      setLoading(true);
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Giriş başarısız."); setLoading(false); return; }
      sessionStorage.setItem("justLoggedIn", "1");     // welcome tostu
      localStorage.setItem("auth:updated", Date.now().toString()); // NavBar refetch
      router.push("/products");
    } catch { setErr("Bir hata oluştu."); setLoading(false); }
  }

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-md card p-6 backdrop-blur">
        <h1 className="text-2xl font-semibold text-center">Giriş Yap</h1>
        <p className="text-neutral-400 text-center text-sm mt-1">E-posta veya kullanıcı adı + şifre ile giriş.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div><label className="block text-sm mb-1">E-posta veya Kullanıcı adı</label>
            <input className="input" value={form.identifier} onChange={e=>setForm({ ...form, identifier: e.target.value })} />
          </div>
          <div><label className="block text-sm mb-1">Şifre</label>
            <input type="password" className="input" value={form.password} onChange={e=>setForm({ ...form, password: e.target.value })} />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={loading}
                  className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 font-medium bg-emerald-500/90 hover:bg-emerald-500 text-black transition disabled:opacity-60">
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
        <p className="text-center text-sm text-neutral-400 mt-4">Hesabın yok mu? <a href="/register" className="text-neutral-200 underline underline-offset-4">Kayıt Ol</a></p>
      </div>
    </div>
  );
}
