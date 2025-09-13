"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!form.username || !form.email || !form.password) {
      setErr("Lütfen tüm alanları doldurun.");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Kayıt başarısız.");
        setLoading(false);
        return;
      }
      router.push("/login");
    } catch {
      setErr("Bir hata oluştu.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 backdrop-blur">
        <h1 className="text-2xl font-semibold text-center">Hesap Oluştur</h1>
        <p className="text-neutral-400 text-center text-sm mt-1">Demo için basit kayıt. Veriler MySQL’de saklanır.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="block text-sm mb-1">Kullanıcı adı</label>
            <input
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-600"
              placeholder="ardac"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">E-posta</label>
            <input
              type="email"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-600"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Şifre</label>
            <input
              type="password"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-600"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 font-medium bg-emerald-500/90 hover:bg-emerald-500 text-black transition disabled:opacity-60"
          >
            {loading ? "Oluşturuluyor..." : "Kayıt Ol"}
          </button>
        </form>

        <p className="text-center text-sm text-neutral-400 mt-4">
          Zaten hesabın var mı? <a href="/login" className="text-neutral-200 underline underline-offset-4">Giriş Yap</a>
        </p>
      </div>
    </div>
  );
}
