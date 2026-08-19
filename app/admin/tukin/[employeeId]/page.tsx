"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type DayRow = {
  date: string;
  dayName: string;
  status: string;
  telatMenit: number | null;
  telatPercent: number;
  pulangCepatMenit: number | null;
  pulangCepatPercent: number;
  alpaPercent: number;
  leavePercent: number;
  leaveTypeName: string | null;
  totalPercent: number;
  potonganRp: number | null;
};

type Employee = {
  id: string;
  name: string;
  nip: string | null;
  positionName: string | null;
  jobClassAmount: number | null;
  initialDeduction: number;
  baseAmount: number | null;
};

type Summary = {
  jobClassAmount: number | null;
  initialDeduction: number;
  tunjanganKinerja: number | null;
  telatTotal: number;
  pulangCepatTotal: number;
  alpaTotal: number;
  leaveTotal: number;
  rawTotalPercent: number;
  officialPercent: number;
  overrideReason: string | null;
  officialDeductionAmount: number | null;
  officialNetAmount: number | null;
};

function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 7);
}

function formatTanggal(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

function pct(v: number): string {
  return v > 0 ? `${v}` : "–";
}

function rupiah(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("id-ID");
}

export default function TukinPegawaiPage() {
  const params = useParams<{ employeeId: string }>();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("period") || currentMonth());
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return fetch(`/api/admin/tukin/${params.employeeId}?period=${month}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Gagal memuat data.");
        setEmployee(data.employee);
        setDays(data.days ?? []);
        setSummary(data.summary);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.employeeId, month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-8">
        <Link href="/admin/tukin" className="text-[13px] font-semibold text-pine hover:underline">
          ← Kembali ke Tunjangan Kinerja
        </Link>
        <h1 className="font-display text-[28px] leading-tight text-ink mt-2">{employee?.name ?? "Memuat…"}</h1>
        {employee && (
          <p className="mt-1 text-[13px] text-muted">
            {employee.nip ?? "-"}
            {employee.positionName ? ` · ${employee.positionName}` : ""}
            {employee.jobClassAmount !== null
              ? ` · Nilai Tunjangan Kinerja Rp${rupiah(employee.jobClassAmount)}`
              : " · Belum ada nominal tunjangan kinerja"}
          </p>
        )}
      </header>

      {error && <p className="text-[13px] text-red-700 mb-6">{error}</p>}

      <label className="block w-fit mb-6">
        <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Bulan</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
        />
      </label>

      {summary && (
        <div className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-6">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-3">Ringkasan sebulan</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px] mb-3">
            <div>
              <p className="text-muted">Nama Jabatan</p>
              <p className="text-ink font-semibold">{employee?.positionName ?? "-"}</p>
            </div>
            <div>
              <p className="text-muted">Nilai Tunjangan Kinerja</p>
              <p className="text-ink font-semibold">Rp{rupiah(summary.jobClassAmount)}</p>
            </div>
            <div>
              <p className="text-muted">Potongan Awal</p>
              <p className="text-ink font-semibold">Rp{rupiah(summary.initialDeduction)}</p>
            </div>
            <div>
              <p className="text-muted">Tunjangan Kinerja</p>
              <p className="text-ink font-semibold">Rp{rupiah(summary.tunjanganKinerja)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px] mb-3">
            <div>
              <p className="text-muted">Total dari Terlambat</p>
              <p className="text-ink font-semibold">{summary.telatTotal}%</p>
            </div>
            <div>
              <p className="text-muted">Total dari Pulang Cepat</p>
              <p className="text-ink font-semibold">{summary.pulangCepatTotal}%</p>
            </div>
            <div>
              <p className="text-muted">Total dari Tanpa Keterangan</p>
              <p className="text-ink font-semibold">{summary.alpaTotal}%</p>
            </div>
            <div>
              <p className="text-muted">Total dari Cuti/Lainnya</p>
              <p className="text-ink font-semibold">{summary.leaveTotal}%</p>
            </div>
          </div>
          <div className="border-t border-cardGreenDark/10 pt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
            <span>
              Total potongan: <strong className="text-ink">{summary.officialPercent}%</strong> (Rp{rupiah(summary.officialDeductionAmount)})
            </span>
            <span>
              Tunjangan Kinerja Diterima: <strong className="text-ink">Rp{rupiah(summary.officialNetAmount)}</strong>
            </span>
          </div>
          {summary.overrideReason && (
            <p className="mt-2 text-[12.5px] text-amber-700">
              Rincian harian di bawah bersifat informatif -- total resmi mengikuti kebijakan: {summary.overrideReason}
              {summary.rawTotalPercent !== summary.officialPercent ? ` (bukan ${summary.rawTotalPercent}% dari penjumlahan mentah)` : ""}.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : days.length === 0 ? (
        <p className="text-[14px] text-muted">Tidak ada data untuk bulan ini.</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Tanggal</th>
                <th className="text-left px-4 py-2.5 font-semibold">Hari</th>
                <th className="text-right px-4 py-2.5 font-semibold">Terlambat</th>
                <th className="text-right px-4 py-2.5 font-semibold">PSW</th>
                <th className="text-right px-4 py-2.5 font-semibold">Tanpa Keterangan</th>
                <th className="text-right px-4 py-2.5 font-semibold">Lainnya</th>
                <th className="text-right px-4 py-2.5 font-semibold">Total Persentase</th>
                <th className="text-right px-4 py-2.5 font-semibold">Total Potongan</th>
                <th className="text-left px-4 py-2.5 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-ink">{formatTanggal(d.date)}</td>
                  <td className="px-4 py-2.5 text-muted">{d.dayName}</td>
                  <td className="px-4 py-2.5 text-muted text-right">{pct(d.telatPercent)}</td>
                  <td className="px-4 py-2.5 text-muted text-right">{pct(d.pulangCepatPercent)}</td>
                  <td className="px-4 py-2.5 text-muted text-right">{pct(d.alpaPercent)}</td>
                  <td className="px-4 py-2.5 text-muted text-right">{pct(d.leavePercent)}</td>
                  <td className="px-4 py-2.5 text-ink text-right font-semibold">{d.totalPercent > 0 ? d.totalPercent : "-"}</td>
                  <td className="px-4 py-2.5 text-muted text-right">{d.potonganRp && d.potonganRp > 0 ? rupiah(d.potonganRp) : "0"}</td>
                  <td className="px-4 py-2.5 text-muted text-[12.5px]">{d.leaveTypeName ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
