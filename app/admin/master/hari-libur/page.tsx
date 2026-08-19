"use client";

import { useEffect, useState } from "react";

type Holiday = { id: number; holiday_date: string; description: string };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export default function HariLiburPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [widgetMonth, setWidgetMonth] = useState(new Date().getMonth() + 1);
  const [widgetYear, setWidgetYear] = useState(currentYear);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);

  function load() {
    setLoading(true);
    return fetch(`/api/admin/master/hari-libur?year=${year}`)
      .then((r) => r.json())
      .then((d) => setHolidays(d.holidays ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  function loadWorkingDays() {
    setWidgetLoading(true);
    fetch(`/api/admin/calendar/working-days?year=${widgetYear}&month=${widgetMonth}`)
      .then((r) => r.json())
      .then((d) => setWorkingDays(typeof d.workingDays === "number" ? d.workingDays : null))
      .finally(() => setWidgetLoading(false));
  }

  useEffect(() => {
    loadWorkingDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetYear, widgetMonth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/master/hari-libur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holiday_date: date, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setDate("");
      setDescription("");
      if (date.slice(0, 4) === String(year)) load();
      loadWorkingDays();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: number) {
    await fetch(`/api/admin/master/hari-libur/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holiday_date: editDate, description: editDescription }),
    });
    setEditingId(null);
    load();
    loadWorkingDays();
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Hapus hari libur "${label}"?`)) return;
    await fetch(`/api/admin/master/hari-libur/${id}`, { method: "DELETE" });
    load();
    loadWorkingDays();
  }

  const years = Array.from({ length: currentYear - 2013 + 3 }, (_, i) => 2013 + i);

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-display text-[28px] leading-tight text-ink mb-6">Hari Libur</h1>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-3">
          Jumlah hari kerja (otomatis)
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Bulan</span>
            <select
              className={inputClass}
              value={widgetMonth}
              onChange={(e) => setWidgetMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tahun</span>
            <select
              className={inputClass}
              value={widgetYear}
              onChange={(e) => setWidgetYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <p className="text-[14px] text-ink pb-2.5">
            {widgetLoading ? "Menghitung…" : workingDays !== null ? (
              <>
                <span className="font-display text-[22px]">{workingDays}</span> hari kerja
              </>
            ) : "—"}
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal</span>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Keterangan</span>
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Hari Kemerdekaan RI" required />
        </label>
        <button type="submit" disabled={submitting} className="sm:col-span-3 rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit">
          {submitting ? "Menyimpan…" : "Tambah"}
        </button>
        {error && <p className="sm:col-span-3 text-[13px] text-red-700">{error}</p>}
      </form>

      <label className="block mb-4 w-fit">
        <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tahun ditampilkan</span>
        <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Tanggal</th>
                <th className="text-left px-4 py-2.5 font-semibold">Keterangan</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-muted text-center">Belum ada hari libur di tahun ini.</td>
                </tr>
              )}
              {holidays.map((h) =>
                editingId === h.id ? (
                  <tr key={h.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                    <td className="px-4 py-2.5"><input type="date" className={inputClass} value={editDate} onChange={(e) => setEditDate(e.target.value)} /></td>
                    <td className="px-4 py-2.5"><input className={inputClass} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(h.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                        <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={h.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{h.holiday_date}</td>
                    <td className="px-4 py-2.5 text-muted">{h.description}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(h.id);
                            setEditDate(h.holiday_date);
                            setEditDescription(h.description);
                          }}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(h.id, h.description)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
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
    </div>
  );
}
