"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal login.");
        return;
      }

      router.push("/admin/pegawai");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display text-[28px] leading-tight text-ink mb-1">Login</h1>
      <p className="text-[14px] text-muted mb-8">
        Masuk ke sistem kepegawaian & presensi. Pakai nomor WhatsApp dan password yang sama
        seperti di Laporan Kinerja Harian.
      </p>

      <form
        onSubmit={handleSubmit}
        className="rounded-card bg-panel border border-cardGreenDark/20 shadow-[0_1px_0_rgba(28,37,33,0.04)] p-5"
      >
        <label className="block mb-4">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nomor WhatsApp</span>
          <input
            type="tel"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="0812xxxxxxx"
            className="w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
          />
        </label>

        <label className="block mb-4">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
          />
        </label>

        {error && <p className="text-[13px] text-red-700 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-cardGreen px-4 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60"
        >
          {loading ? "Memproses…" : "Login"}
        </button>
      </form>
    </main>
  );
}
