"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type DayRow = {
  date: string;
  status: "libur" | "shift" | "cuti" | "belum_ada_data" | "hadir" | "terlambat" | "pulang_cepat";
  jamMasuk: string | null;
  jamPulang: string | null;
  telatMenit: number | null;
  pulangCepatMenit: number | null;
  sumber: "fingerprint" | "wa_ping" | null;
  leaveTypeName: string | null;
};

type Employee = { id: string; name: string; nip: string | null; unitName: string | null };

const SUMBER_LABEL: Record<NonNullable<DayRow["sumber"]>, string> = {
  fingerprint: "Fingerprint",
  wa_ping: "WA",
};

const STATUS_LABEL: Record<DayRow["status"], string> = {
  libur: "Libur",
  shift: "Shift",
  cuti: "Cuti",
  belum_ada_data: "Belum Ada Data",
  hadir: "Hadir",
  terlambat: "Terlambat",
  pulang_cepat: "Pulang Cepat",
};

const STATUS_CLASS: Record<DayRow["status"], string> = {
  libur: "bg-pineLight text-ink",
  shift: "bg-pineLight text-ink",
  cuti: "bg-sky-100 text-sky-800",
  belum_ada_data: "bg-amber-100 text-amber-800",
  hadir: "bg-emerald-100 text-emerald-800",
  terlambat: "bg-red-100 text-red-800",
  pulang_cepat: "bg-red-100 text-red-800",
};

function formatTanggal(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+08:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatWita(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function currentMonth(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" })
    .format(now)
    .slice(0, 7);
}

export default function PresensiPegawaiPage() {
  const params = useParams<{ employeeId: string }>();
  const [month, setMonth] = useState(currentMonth());
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    return fetch(`/api/admin/presensi/${params.employeeId}?month=${month}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Gagal memuat data.");
        setEmployee(data.employee);
        setDays(data.days ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.employeeId, month]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = days.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">

      <header className="mb-8">
        <Link href="/admin/presensi" className="text-[13px] font-semibold text-pine hover:underline">
          ← Kembali ke Presensi
        </Link>
        <h1 className="font-display text-[28px] leading-tight text-ink mt-2">
          {employee?.name ?? "Memuat…"}
        </h1>
        {employee && (
          <p className="mt-1 text-[13px] text-muted">
            {employee.nip ?? "-"}
            {employee.unitName ? ` · ${employee.unitName}` : ""}
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

      {!loading && days.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(STATUS_LABEL) as DayRow["status"][])
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
      ) : days.length === 0 ? (
        <p className="text-[14px] text-muted">Tidak ada data untuk bulan ini.</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Tanggal</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Masuk</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Pulang</th>
                <th className="text-left px-4 py-2.5 font-semibold">Sumber</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-ink">{formatTanggal(d.date)}</td>
                  <td className="px-4 py-2.5 text-muted">{formatWita(d.jamMasuk)}</td>
                  <td className="px-4 py-2.5 text-muted">{formatWita(d.jamPulang)}</td>
                  <td className="px-4 py-2.5 text-muted">{d.sumber ? SUMBER_LABEL[d.sumber] : "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_CLASS[d.status]}`}>
                      {d.status === "cuti" && d.leaveTypeName ? d.leaveTypeName : STATUS_LABEL[d.status]}
                      {d.status === "terlambat" && d.telatMenit ? ` (${d.telatMenit} mnt)` : ""}
                      {d.status === "pulang_cepat" && d.pulangCepatMenit ? ` (${d.pulangCepatMenit} mnt)` : ""}
                    </span>
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
