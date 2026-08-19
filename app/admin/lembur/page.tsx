"use client";

import { useCallback, useEffect, useState } from "react";
import Pagination from "../../../components/Pagination";

type Participant = { employee_id: string; name: string; nip: string | null };
type OvertimeEvent = {
  id: number;
  event_date: string;
  hours: string;
  purpose: string | null;
  participants: Participant[];
};
type PegawaiOption = { id: string; name: string; nip: string | null };

function witaMonthNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 7);
}

const PAGE_SIZES = [10, 50, 100];

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function LemburPage() {
  const [events, setEvents] = useState<OvertimeEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(witaMonthNow());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [empQuery, setEmpQuery] = useState("");
  const [empOptions, setEmpOptions] = useState<PegawaiOption[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<PegawaiOption[]>([]);
  const [eventDate, setEventDate] = useState("");
  const [hours, setHours] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("month", month);
    if (search) params.set("q", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return fetch(`/api/admin/lembur?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [month, search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [month, search]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const selectedIds = new Set(selectedEmployees.map((e) => e.id));
    if (!empQuery) {
      setEmpOptions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/pegawai?q=${encodeURIComponent(empQuery)}&pageSize=10`)
        .then((r) => r.json())
        .then((d) => setEmpOptions((d.pegawai ?? []).filter((o: PegawaiOption) => !selectedIds.has(o.id))));
    }, 250);
    return () => clearTimeout(t);
  }, [empQuery, selectedEmployees]);

  function addEmployee(o: PegawaiOption) {
    setSelectedEmployees((prev) => (prev.some((e) => e.id === o.id) ? prev : [...prev, o]));
    setEmpQuery("");
    setEmpOptions([]);
  }

  function removeEmployee(id: string) {
    setSelectedEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  function resetForm() {
    setEditingId(null);
    setSelectedEmployees([]);
    setEmpQuery("");
    setEventDate("");
    setHours("");
    setPurpose("");
    setError("");
  }

  function startEdit(ev: OvertimeEvent) {
    setEditingId(ev.id);
    setSelectedEmployees(ev.participants.map((p) => ({ id: p.employee_id, name: p.name, nip: p.nip })));
    setEventDate(ev.event_date);
    setHours(ev.hours);
    setPurpose(ev.purpose ?? "");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (selectedEmployees.length === 0) {
      setError("Pilih minimal satu pegawai.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        event_date: eventDate,
        hours: Number(hours),
        purpose,
        employee_ids: selectedEmployees.map((e) => e.id),
      };
      const res = await fetch(editingId ? `/api/admin/lembur/${editingId}` : "/api/admin/lembur", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      resetForm();
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus data lembur ini?")) return;
    await fetch(`/api/admin/lembur/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    load();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Lembur</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Catatan kerja lembur pegawai (tanggal, jam, keperluan). Belum ada alur
          persetujuan -- data yang diinput admin langsung tercatat.
        </p>
      </header>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
          {editingId ? `Edit data lembur #${editingId}` : "Tambah data lembur"}
        </p>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block relative sm:col-span-2">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Pegawai</span>
            <input
              className={inputClass}
              value={empQuery}
              onChange={(e) => setEmpQuery(e.target.value)}
              placeholder="Cari nama atau NIP, klik untuk menambahkan…"
            />
            {empOptions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-card border border-cardGreenDark/20 bg-canvas shadow-lg overflow-hidden">
                {empOptions.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => addEmployee(o)}
                    className="block w-full text-left px-4 py-2 text-[13px] hover:bg-pineLight"
                  >
                    {o.name} {o.nip ? <span className="text-muted">({o.nip})</span> : null}
                  </button>
                ))}
              </div>
            )}
            {selectedEmployees.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedEmployees.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-pine/10 px-3 py-1 text-[12.5px] text-ink"
                  >
                    {e.name}
                    <button
                      type="button"
                      onClick={() => removeEmployee(e.id)}
                      className="text-muted hover:text-ink"
                      aria-label={`Hapus ${e.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal</span>
            <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Lama (jam)</span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              className={inputClass}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Keperluan</span>
            <input className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="mis. stock opname" />
          </label>

          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit"
            >
              {submitting ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan"}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-[12.5px] font-semibold text-muted hover:text-ink">
                Batal edit
              </button>
            )}
          </div>
          {error && <p className="sm:col-span-2 text-[13px] text-red-700">{error}</p>}
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={inputClass + " w-fit"}
        />
        <input
          type="text"
          placeholder="Cari nama atau NIP pegawai…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass + " w-56"}
        />
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          Tampilkan
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-full border border-cardGreenDark/20 bg-pineLight px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <span className="text-[12.5px] text-muted">{total} data</span>
      </div>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : events.length === 0 ? (
        <p className="text-[14px] text-muted">Belum ada data lembur bulan ini.</p>
      ) : (
        <>
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Tanggal</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam</th>
                <th className="text-left px-4 py-2.5 font-semibold">Keperluan</th>
                <th className="text-left px-4 py-2.5 font-semibold">Pegawai</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-muted">{ev.event_date}</td>
                  <td className="px-4 py-2.5 text-ink">{ev.hours}</td>
                  <td className="px-4 py-2.5 text-muted text-[12.5px]">{ev.purpose ?? "-"}</td>
                  <td className="px-4 py-2.5 text-muted text-[12.5px]">
                    {ev.participants.map((p) => p.name).join(", ")}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(ev)}
                        className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
        </>
      )}
    </div>
  );
}
