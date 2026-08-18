"use client";

import { useEffect, useState } from "react";
import AdminNav from "../../../../components/AdminNav";

type Period = { year: number; start_date: string; end_date: string };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function RamadhanPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingYear, setEditingYear] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  function load() {
    setLoading(true);
    return fetch("/api/admin/master/ramadhan")
      .then((r) => r.json())
      .then((d) => setPeriods(d.periods ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/master/ramadhan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), start_date: startDate, end_date: endDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setYear("");
      setStartDate("");
      setEndDate("");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(y: number) {
    await fetch(`/api/admin/master/ramadhan/${y}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: editStart, end_date: editEnd }),
    });
    setEditingYear(null);
    load();
  }

  async function handleDelete(y: number) {
    if (!confirm(`Hapus periode Ramadhan tahun ${y}?`)) return;
    await fetch(`/api/admin/master/ramadhan/${y}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <AdminNav />
      <h1 className="font-display text-[28px] leading-tight text-ink mb-6">Periode Ramadhan</h1>

      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tahun</span>
          <input type="number" className={inputClass} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2027" required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal mulai</span>
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal selesai</span>
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting} className="sm:col-span-3 rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit">
          {submitting ? "Menyimpan…" : "Tambah"}
        </button>
        {error && <p className="sm:col-span-3 text-[13px] text-red-700">{error}</p>}
      </form>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Tahun</th>
                <th className="text-left px-4 py-2.5 font-semibold">Mulai</th>
                <th className="text-left px-4 py-2.5 font-semibold">Selesai</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) =>
                editingYear === p.year ? (
                  <tr key={p.year} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                    <td className="px-4 py-2.5 text-ink">{p.year}</td>
                    <td className="px-4 py-2.5"><input type="date" className={inputClass} value={editStart} onChange={(e) => setEditStart(e.target.value)} /></td>
                    <td className="px-4 py-2.5"><input type="date" className={inputClass} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(p.year)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                        <button onClick={() => setEditingYear(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.year} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{p.year}</td>
                    <td className="px-4 py-2.5 text-muted">{p.start_date}</td>
                    <td className="px-4 py-2.5 text-muted">{p.end_date}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingYear(p.year);
                            setEditStart(p.start_date);
                            setEditEnd(p.end_date);
                          }}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(p.year)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
