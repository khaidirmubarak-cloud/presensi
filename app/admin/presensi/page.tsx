"use client";

import { useCallback, useEffect, useState } from "react";
import AdminNav from "../../../components/AdminNav";

type PresensiRow = {
  employeeId: string;
  name: string;
  nip: string | null;
  unitName: string | null;
  status: "libur" | "shift" | "belum_ada_data" | "hadir" | "terlambat" | "pulang_cepat";
  jamMasuk: string | null;
  jamPulang: string | null;
  telatMenit: number | null;
  pulangCepatMenit: number | null;
  sumber: "fingerprint" | "wa_ping" | null;
};

const SUMBER_LABEL: Record<NonNullable<PresensiRow["sumber"]>, string> = {
  fingerprint: "Fingerprint",
  wa_ping: "WA",
};

const STATUS_LABEL: Record<PresensiRow["status"], string> = {
  libur: "Libur",
  shift: "Shift",
  belum_ada_data: "Belum Ada Data",
  hadir: "Hadir",
  terlambat: "Terlambat",
  pulang_cepat: "Pulang Cepat",
};

const STATUS_CLASS: Record<PresensiRow["status"], string> = {
  libur: "bg-pineLight text-ink",
  shift: "bg-pineLight text-ink",
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

export default function PresensiPage() {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<PresensiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`/api/admin/presensi?date=${date}`)
      .then((r) => r.json())
      .then((d) => setRows(d.employees ?? []))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || (r.nip ?? "").includes(q);
  });

  const summary = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <AdminNav />

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
      </div>

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
      ) : filtered.length === 0 ? (
        <p className="text-[14px] text-muted">Tidak ada data.</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
                <th className="text-left px-4 py-2.5 font-semibold">NIP</th>
                <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Masuk</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Pulang</th>
                <th className="text-left px-4 py-2.5 font-semibold">Sumber</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.employeeId} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-muted">{r.nip ?? "-"}</td>
                  <td className="px-4 py-2.5 text-muted">{r.unitName ?? "-"}</td>
                  <td className="px-4 py-2.5 text-muted">{formatWita(r.jamMasuk)}</td>
                  <td className="px-4 py-2.5 text-muted">{formatWita(r.jamPulang)}</td>
                  <td className="px-4 py-2.5 text-muted">{r.sumber ? SUMBER_LABEL[r.sumber] : "-"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                      {r.status === "terlambat" && r.telatMenit ? ` (${r.telatMenit} mnt)` : ""}
                      {r.status === "pulang_cepat" && r.pulangCepatMenit ? ` (${r.pulangCepatMenit} mnt)` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
