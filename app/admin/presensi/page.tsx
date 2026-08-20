"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Pagination from "../../../components/Pagination";

type PresensiRow = {
  employeeId: string;
  name: string;
  nip: string | null;
  unitName: string | null;
  status: "libur" | "shift" | "cuti" | "belum_ada_data" | "hadir" | "terlambat" | "pulang_cepat";
  jamMasuk: string | null;
  jamPulang: string | null;
  telatMenit: number | null;
  pulangCepatMenit: number | null;
  sumber: "fingerprint" | "wa_ping" | null;
  leaveTypeName: string | null;
};

const SUMBER_LABEL: Record<NonNullable<PresensiRow["sumber"]>, string> = {
  fingerprint: "Fingerprint",
  wa_ping: "WA",
};

const STATUS_LABEL: Record<PresensiRow["status"], string> = {
  libur: "Libur",
  shift: "Shift",
  cuti: "Cuti",
  belum_ada_data: "Belum Ada Data",
  hadir: "Hadir",
  terlambat: "Terlambat",
  pulang_cepat: "Pulang Cepat",
};

const STATUS_CLASS: Record<PresensiRow["status"], string> = {
  libur: "bg-pineLight text-ink",
  shift: "bg-pineLight text-ink",
  cuti: "bg-sky-100 text-sky-800",
  belum_ada_data: "bg-amber-100 text-amber-800",
  hadir: "bg-emerald-100 text-emerald-800",
  terlambat: "bg-red-100 text-red-800",
  pulang_cepat: "bg-red-100 text-red-800",
};

function formatWita(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
}

const PAGE_SIZES = [10, 50, 100];

export default function PresensiPage() {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<PresensiRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [unitId, setUnitId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [printMonth, setPrintMonth] = useState(todayIso().slice(0, 7));
  const [printing, setPrinting] = useState<"pdf" | "excel" | null>(null);
  const [printError, setPrintError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("date", date);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (category) params.set("category", category);
    if (unitId) params.set("unitId", unitId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return fetch(`/api/admin/presensi?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.employees ?? []);
        setTotal(d.total ?? 0);
        setSummary(d.summary ?? {});
        setCategories(d.categories ?? []);
        setUnits(d.units ?? []);
      })
      .finally(() => setLoading(false));
  }, [date, debouncedSearch, category, unitId, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [date]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.employeeId));

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const r of rows) next.delete(r.employeeId);
      } else {
        for (const r of rows) next.add(r.employeeId);
      }
      return next;
    });
  }

  async function handlePrint(format: "pdf" | "excel") {
    setPrintError("");
    setPrinting(format);
    try {
      const res = await fetch("/api/admin/presensi/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: printMonth,
          format,
          employeeIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
          q: debouncedSearch || undefined,
          category: category || undefined,
          unitId: unitId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setPrintError(data?.error || "Gagal membuat file cetak.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `presensi_${printMonth}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPrintError("Terjadi kesalahan jaringan.");
    } finally {
      setPrinting(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">

      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Presensi</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Status kehadiran harian dihitung otomatis dibandingkan jam kerja seharusnya. Sumber
          utama data adalah scan mesin fingerprint; share-location WhatsApp cuma dipakai kalau
          hari itu tidak ada data fingerprint. Pegawai shift belum masuk hitungan otomatis.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tanggal</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
          />
        </label>
        <input
          type="text"
          placeholder="Cari nama atau NIP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13px] text-ink w-56 focus:outline-none focus:ring-2 focus:ring-pine/30"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={unitId}
          onChange={(e) => {
            setUnitId(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
        >
          <option value="">Semua unit</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
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
        <button
          type="button"
          onClick={() => setPrintOpen((v) => !v)}
          className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors"
        >
          Cetak
        </button>
      </div>

      {printOpen && (
        <div className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-6 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Bulan</span>
            <input
              type="month"
              value={printMonth}
              onChange={(e) => setPrintMonth(e.target.value)}
              className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
            />
          </label>
          <button
            type="button"
            disabled={printing !== null}
            onClick={() => handlePrint("pdf")}
            className="rounded-full border border-cardGreenDark/30 px-4 py-2 text-[13px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors disabled:opacity-60"
          >
            {printing === "pdf" ? "Membuat PDF…" : "Unduh PDF"}
          </button>
          <button
            type="button"
            disabled={printing !== null}
            onClick={() => handlePrint("excel")}
            className="rounded-full border border-cardGreenDark/30 px-4 py-2 text-[13px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors disabled:opacity-60"
          >
            {printing === "excel" ? "Membuat Excel…" : "Unduh Excel"}
          </button>
          <p className="text-[12.5px] text-muted">
            {selectedIds.size > 0 ? `${selectedIds.size} pegawai dipilih` : "Semua pegawai sesuai filter saat ini"}
          </p>
          {printError && <p className="text-[13px] text-red-700 w-full">{printError}</p>}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(STATUS_LABEL) as PresensiRow["status"][])
            .filter((s) => summary[s])
            .map((s) => (
              <span key={s} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS_CLASS[s]}`}>
                {STATUS_LABEL[s]}: {summary[s]}
              </span>
            ))}
        </div>
      )}

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-muted">Tidak ada data.</p>
      ) : (
        <>
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="px-4 py-2.5">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="h-4 w-4" />
                </th>
                <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
                <th className="text-left px-4 py-2.5 font-semibold">NIP</th>
                <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Masuk</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Pulang</th>
                <th className="text-left px-4 py-2.5 font-semibold">Sumber</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.employeeId)}
                      onChange={() => toggleRow(r.employeeId)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-muted">{r.nip ?? "-"}</td>
                  <td className="px-4 py-2.5 text-muted">{r.unitName ?? "-"}</td>
                  <td className="px-4 py-2.5 text-muted">{formatWita(r.jamMasuk)}</td>
                  <td className="px-4 py-2.5 text-muted">{formatWita(r.jamPulang)}</td>
                  <td className="px-4 py-2.5 text-muted">{r.sumber ? SUMBER_LABEL[r.sumber] : "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_CLASS[r.status]}`}>
                      {r.status === "cuti" && r.leaveTypeName ? r.leaveTypeName : STATUS_LABEL[r.status]}
                      {r.status === "terlambat" && r.telatMenit ? ` (${r.telatMenit} mnt)` : ""}
                      {r.status === "pulang_cepat" && r.pulangCepatMenit ? ` (${r.pulangCepatMenit} mnt)` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/presensi/${r.employeeId}`}
                      className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors"
                    >
                      Detail
                    </Link>
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
