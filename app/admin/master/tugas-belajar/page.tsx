"use client";

import { useCallback, useEffect, useState } from "react";

type Assignment = {
  id: number;
  employee_id: string;
  employee_name: string;
  employee_nip: string | null;
  type: "tube1" | "tube2";
  start_date: string | null;
  status: "aktif" | "selesai";
};

type PegawaiOption = { id: string; name: string; nip: string | null };

const TYPE_LABEL: Record<Assignment["type"], string> = {
  tube1: "TUBE1 (potongan 0%)",
  tube2: "TUBE2 (potongan flat 50%)",
};

const STATUS_LABEL: Record<Assignment["status"], string> = {
  aktif: "Aktif",
  selesai: "Selesai",
};

const STATUS_CLASS: Record<Assignment["status"], string> = {
  aktif: "bg-emerald-100 text-emerald-800",
  selesai: "bg-pineLight text-ink",
};

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function TugasBelajarPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [empQuery, setEmpQuery] = useState("");
  const [empOptions, setEmpOptions] = useState<PegawaiOption[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<PegawaiOption | null>(null);
  const [type, setType] = useState<Assignment["type"]>("tube1");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    return fetch(`/api/admin/study-assignments?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setAssignments(d.assignments ?? []))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!empQuery || selectedEmp) {
      setEmpOptions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/pegawai?q=${encodeURIComponent(empQuery)}&pageSize=10`)
        .then((r) => r.json())
        .then((d) => setEmpOptions(d.pegawai ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [empQuery, selectedEmp]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedEmp) {
      setError("Pilih pegawai dulu.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/study-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: selectedEmp.id, type, start_date: startDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setSelectedEmp(null);
      setEmpQuery("");
      setType("tube1");
      setStartDate("");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: number, status: Assignment["status"]) {
    await fetch(`/api/admin/study-assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Hapus data tugas belajar "${label}"?`)) return;
    await fetch(`/api/admin/study-assignments/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Tugas Belajar</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Pegawai dengan status aktif TUBE2 dapat potongan tukin flat 50% (menggantikan
          perhitungan harian), TUBE1 dikecualikan total dari potongan.
        </p>
      </header>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
          Tambah data tugas belajar
        </p>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block relative">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Pegawai</span>
            <input
              className={inputClass}
              value={selectedEmp ? `${selectedEmp.name}${selectedEmp.nip ? ` (${selectedEmp.nip})` : ""}` : empQuery}
              onChange={(e) => {
                setSelectedEmp(null);
                setEmpQuery(e.target.value);
              }}
              placeholder="Cari nama atau NIP…"
              required
            />
            {empOptions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-card border border-cardGreenDark/20 bg-canvas shadow-lg overflow-hidden">
                {empOptions.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => {
                      setSelectedEmp(o);
                      setEmpOptions([]);
                    }}
                    className="block w-full text-left px-4 py-2 text-[13px] hover:bg-pineLight"
                  >
                    {o.name} {o.nip ? <span className="text-muted">({o.nip})</span> : null}
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Jenis</span>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as Assignment["type"])}>
              <option value="tube1">TUBE1 (potongan 0%)</option>
              <option value="tube2">TUBE2 (potongan flat 50%)</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal mulai</span>
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="sm:col-span-2 rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit"
          >
            {submitting ? "Menyimpan…" : "Simpan"}
          </button>
          {error && <p className="sm:col-span-2 text-[13px] text-red-700">{error}</p>}
        </form>
      </section>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Cari nama atau NIP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass + " w-56"}
        />
        <span className="text-[12.5px] text-muted">{assignments.length} data</span>
      </div>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : assignments.length === 0 ? (
        <p className="text-[14px] text-muted">Belum ada data tugas belajar.</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Pegawai</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jenis</th>
                <th className="text-left px-4 py-2.5 font-semibold">Tanggal Mulai</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-ink">
                    {a.employee_name}
                    {a.employee_nip ? <span className="block text-[11.5px] text-muted">{a.employee_nip}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{TYPE_LABEL[a.type]}</td>
                  <td className="px-4 py-2.5 text-muted">{a.start_date ?? "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_CLASS[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      {a.status === "aktif" ? (
                        <button
                          onClick={() => setStatus(a.id, "selesai")}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Tandai Selesai
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(a.id, "aktif")}
                          className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas"
                        >
                          Aktifkan Lagi
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(a.id, a.employee_name)}
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
      )}
    </div>
  );
}
