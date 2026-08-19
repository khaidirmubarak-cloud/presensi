"use client";

import { useCallback, useEffect, useState } from "react";
import Pagination from "../../../components/Pagination";

type LeaveRequest = {
  id: number;
  employee_id: string;
  employee_name: string;
  employee_nip: string | null;
  leave_type_id: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pengajuan" | "disetujui" | "ditolak";
};

type LeaveType = { id: string; name: string };
type PegawaiOption = { id: string; name: string; nip: string | null };

const STATUS_LABEL: Record<LeaveRequest["status"], string> = {
  pengajuan: "Menunggu",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

const STATUS_CLASS: Record<LeaveRequest["status"], string> = {
  pengajuan: "bg-amber-100 text-amber-800",
  disetujui: "bg-emerald-100 text-emerald-800",
  ditolak: "bg-red-100 text-red-800",
};

const PAGE_SIZES = [10, 50, 100];

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function KetidakhadiranPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  // Form tambah/edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [empQuery, setEmpQuery] = useState("");
  const [empOptions, setEmpOptions] = useState<PegawaiOption[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<PegawaiOption | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [formStatus, setFormStatus] = useState<"disetujui" | "pengajuan">("disetujui");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return fetch(`/api/admin/ketidakhadiran?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRequests(d.requests ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [search, statusFilter, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    fetch("/api/admin/master/jenis-cuti")
      .then((r) => r.json())
      .then((d) => setLeaveTypes(d.leaveTypes ?? []));
  }, []);

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

  function resetForm() {
    setEditingId(null);
    setSelectedEmp(null);
    setEmpQuery("");
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
    setFormStatus("disetujui");
    setError("");
  }

  function startEdit(r: LeaveRequest) {
    setEditingId(r.id);
    setSelectedEmp({ id: r.employee_id, name: r.employee_name, nip: r.employee_nip });
    setEmpQuery("");
    setLeaveTypeId(r.leave_type_id);
    setStartDate(r.start_date);
    setEndDate(r.end_date);
    setReason(r.reason ?? "");
    setFormStatus(r.status === "ditolak" ? "pengajuan" : r.status);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedEmp) {
      setError("Pilih pegawai dulu.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        employee_id: selectedEmp.id,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: formStatus,
      };
      const res = await fetch(editingId ? `/api/admin/ketidakhadiran/${editingId}` : "/api/admin/ketidakhadiran", {
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

  async function setStatus(id: number, status: LeaveRequest["status"]) {
    await fetch(`/api/admin/ketidakhadiran/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Hapus pengajuan cuti "${label}"?`)) return;
    await fetch(`/api/admin/ketidakhadiran/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">

      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Ketidakhadiran</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Cuti/izin yang <strong>Disetujui</strong> otomatis mengubah status presensi pegawai
          hari itu jadi "Cuti" (lihat menu Presensi), bukan "Belum Ada Data".
        </p>
      </header>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
          {editingId ? `Edit pengajuan #${editingId}` : "Tambah pengajuan cuti/izin"}
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
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Jenis cuti</span>
            <select className={inputClass} value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} required>
              <option value="">— pilih —</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal mulai</span>
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal selesai</span>
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Keterangan</span>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. sakit demam" />
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Status</span>
            <select className={inputClass} value={formStatus} onChange={(e) => setFormStatus(e.target.value as "disetujui" | "pengajuan")}>
              <option value="disetujui">Langsung disetujui</option>
              <option value="pengajuan">Menunggu persetujuan</option>
            </select>
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass + " w-fit"}
        >
          <option value="">Semua status</option>
          <option value="pengajuan">Menunggu</option>
          <option value="disetujui">Disetujui</option>
          <option value="ditolak">Ditolak</option>
        </select>
        <input
          type="text"
          placeholder="Cari nama atau NIP…"
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
        <span className="text-[12.5px] text-muted">{total} pengajuan</span>
      </div>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : requests.length === 0 ? (
        <p className="text-[14px] text-muted">Belum ada pengajuan cuti/izin.</p>
      ) : (
        <>
          <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-pineLight text-ink">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Pegawai</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Jenis</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Tanggal</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Keterangan</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">
                      {r.employee_name}
                      {r.employee_nip ? <span className="block text-[11.5px] text-muted">{r.employee_nip}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{r.leave_type_name}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`}
                    </td>
                    <td className="px-4 py-2.5 text-muted text-[12.5px]">{r.reason ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_CLASS[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        {r.status === "pengajuan" && (
                          <>
                            <button
                              onClick={() => setStatus(r.id, "disetujui")}
                              className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => setStatus(r.id, "ditolak")}
                              className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => startEdit(r)}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.employee_name)}
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
