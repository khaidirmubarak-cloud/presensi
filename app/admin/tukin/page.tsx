"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Pagination from "../../../components/Pagination";

type Calculation = {
  employee_id: string;
  name: string;
  nip: string | null;
  position_name: string | null;
  job_class_amount: string | null;
  initial_deduction: string;
  base_amount: string;
  deduction_percent: string;
  deduction_amount: string;
  net_amount: string;
};

function witaMonthNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 7);
}

function rupiah(value: string | number | null): string {
  if (value === null) return "-";
  return Number(value).toLocaleString("id-ID");
}

const PAGE_SIZES = [10, 50, 100];

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function TukinPage() {
  const [period, setPeriod] = useState(witaMonthNow());
  const [search, setSearch] = useState("");
  const [calculations, setCalculations] = useState<Calculation[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [category, setCategory] = useState("");
  const [unitId, setUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Map (bukan Set) supaya nama pegawai yang sudah dicentang tetap bisa ditampilkan di
  // panel Cetak walau pegawainya sedang tidak muncul di halaman/filter saat ini -- pola
  // sama seperti app/admin/presensi/page.tsx.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [printOpen, setPrintOpen] = useState(false);
  const [printing, setPrinting] = useState<"pdf" | "excel" | null>(null);
  const [printError, setPrintError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("period", period);
    if (search) params.set("q", search);
    if (category) params.set("category", category);
    if (unitId) params.set("unitId", unitId);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return fetch(`/api/admin/tukin?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setCalculations(d.calculations ?? []);
        setTotal(d.total ?? 0);
        setCategories(d.categories ?? []);
        setUnits(d.units ?? []);
      })
      .finally(() => setLoading(false));
  }, [period, search, category, unitId, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [period, search, category, unitId]);

  function toggleRow(id: string, name: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }

  function removeSelected(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const allOnPageSelected = calculations.length > 0 && calculations.every((c) => selected.has(c.employee_id));

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) {
        for (const c of calculations) next.delete(c.employee_id);
      } else {
        for (const c of calculations) next.set(c.employee_id, c.name);
      }
      return next;
    });
  }

  async function handlePrint(format: "pdf" | "excel") {
    setPrintError("");
    setPrinting(format);
    try {
      const res = await fetch("/api/admin/tukin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          format,
          employeeIds: selected.size > 0 ? Array.from(selected.keys()) : undefined,
          q: search || undefined,
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
      a.download = `tukin_${period}.${format === "pdf" ? "pdf" : "xlsx"}`;
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

  async function handleHitung() {
    setCalculating(true);
    setResultMsg("");
    try {
      const res = await fetch("/api/admin/tukin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultMsg(data.error || "Gagal menghitung.");
        return;
      }
      setResultMsg(
        `Selesai: ${data.calculated} pegawai dihitung${
          data.skipped?.length ? `, ${data.skipped.length} dilewati (belum ada nominal tunjangan kinerja)` : ""
        }.`,
      );
      load();
    } catch {
      setResultMsg("Terjadi kesalahan jaringan.");
    } finally {
      setCalculating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalNet = calculations.reduce((sum, c) => sum + Number(c.net_amount), 0);

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Tunjangan Kinerja</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Perhitungan tunjangan kinerja bulanan berdasarkan nominal kelas jabatan/grade
          non-ASN, dikurangi potongan awal untuk dosen serdos, lalu dipotong sesuai
          keterlambatan/pulang cepat/cuti/alpa. Dokter dan Klinik dikecualikan dari
          potongan; Tugas Belajar TUBE1/TUBE2 menggantikan perhitungan harian.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass + " w-fit"} />
        <button
          onClick={handleHitung}
          disabled={calculating}
          className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit"
        >
          {calculating ? "Menghitung…" : "Hitung Tunjangan Kinerja"}
        </button>
        <input
          type="text"
          placeholder="Cari nama atau NIP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass + " w-56"}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
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
        <div className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-6">
          <div className="flex flex-wrap items-end gap-3">
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
          </div>

          {selected.size === 0 ? (
            <p className="text-[12.5px] text-muted mt-3">Semua pegawai sesuai filter saat ini</p>
          ) : (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12.5px] font-semibold text-ink">{selected.size} pegawai dipilih</p>
                <button
                  type="button"
                  onClick={() => setSelected(new Map())}
                  className="text-[12px] font-semibold text-red-700 hover:underline"
                >
                  Kosongkan semua
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selected.entries()).map(([id, name]) => (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 rounded-full bg-pineLight px-3 py-1 text-[12px] text-ink"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeSelected(id)}
                      aria-label={`Batalkan pilihan ${name}`}
                      className="text-muted hover:text-red-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {printError && <p className="text-[13px] text-red-700 mt-3">{printError}</p>}
        </div>
      )}
      {resultMsg && <p className="mb-4 text-[13px] text-ink">{resultMsg}</p>}

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : calculations.length === 0 ? (
        <p className="text-[14px] text-muted">
          Belum dihitung untuk periode ini -- klik "Hitung Tunjangan Kinerja" di atas.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-muted">
            {total} pegawai -- total diterima (halaman ini) Rp{rupiah(totalNet)}
          </p>
          <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-pineLight text-ink">
                <tr>
                  <th className="px-4 py-2.5">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="h-4 w-4" />
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">Pegawai</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Nama Jabatan</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Nilai Tunjangan Kinerja</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Potongan Awal</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Tunjangan Kinerja</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Potongan %</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Potongan Rp</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Tunjangan Kinerja Diterima</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {calculations.map((c) => (
                  <tr key={c.employee_id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(c.employee_id)}
                        onChange={() => toggleRow(c.employee_id, c.name)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      {c.name}
                      {c.nip ? <span className="block text-[11.5px] text-muted">{c.nip}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.position_name ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(c.job_class_amount)}</td>
                    <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(c.initial_deduction)}</td>
                    <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(c.base_amount)}</td>
                    <td className="px-4 py-2.5 text-muted text-right">{Number(c.deduction_percent).toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(c.deduction_amount)}</td>
                    <td className="px-4 py-2.5 text-ink text-right font-semibold">Rp{rupiah(c.net_amount)}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/tukin/${c.employee_id}?period=${period}`}
                        className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
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
