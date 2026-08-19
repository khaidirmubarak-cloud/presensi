"use client";

import { useCallback, useEffect, useState } from "react";

type Calculation = {
  employee_id: string;
  name: string;
  nip: string | null;
  rank_code: string | null;
  eligible_days: number;
  rate_amount: string;
  tax_percent: string;
  gross_amount: string;
  net_amount: string;
};

function witaMonthNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date()).slice(0, 7);
}

function rupiah(value: string | number): string {
  return Number(value).toLocaleString("id-ID");
}

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function UangMakanPage() {
  const [period, setPeriod] = useState(witaMonthNow());
  const [search, setSearch] = useState("");
  const [calculations, setCalculations] = useState<Calculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("period", period);
    if (search) params.set("q", search);
    return fetch(`/api/admin/uang-makan?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setCalculations(d.calculations ?? []))
      .finally(() => setLoading(false));
  }, [period, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleHitung() {
    setCalculating(true);
    setResultMsg("");
    try {
      const res = await fetch("/api/admin/uang-makan", {
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
          data.skipped?.length ? `, ${data.skipped.length} dilewati (lihat catatan di bawah)` : ""
        }.`,
      );
      load();
    } catch {
      setResultMsg("Terjadi kesalahan jaringan.");
    } finally {
      setCalculating(false);
    }
  }

  const totalNet = calculations.reduce((sum, c) => sum + Number(c.net_amount), 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Uang Makan</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Perhitungan uang makan bulanan: jumlah hari hadir (termasuk jenis cuti/izin
          tertentu yang ditandai di menu Jenis Cuti) dikali nominal per golongan, dipotong
          pajak. Hanya pegawai yang ditandai "Berhak uang makan" yang dihitung.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass + " w-fit"} />
        <button
          onClick={handleHitung}
          disabled={calculating}
          className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit"
        >
          {calculating ? "Menghitung…" : "Hitung Uang Makan"}
        </button>
        <input
          type="text"
          placeholder="Cari nama atau NIP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass + " w-56"}
        />
      </div>
      {resultMsg && <p className="mb-4 text-[13px] text-ink">{resultMsg}</p>}

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : calculations.length === 0 ? (
        <p className="text-[14px] text-muted">
          Belum dihitung untuk periode ini -- klik "Hitung Uang Makan" di atas.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-muted">
            {calculations.length} pegawai -- total diterima Rp{rupiah(totalNet)}
          </p>
          <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-pineLight text-ink">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Pegawai</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Golongan</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Hari Makan</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Nominal/Hari</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Kotor</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Pajak</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Bersih</th>
                </tr>
              </thead>
              <tbody>
                {calculations.map((c) => (
                  <tr key={c.employee_id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">
                      {c.name}
                      {c.nip ? <span className="block text-[11.5px] text-muted">{c.nip}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.rank_code ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted text-right">{c.eligible_days}</td>
                    <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(c.rate_amount)}</td>
                    <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(c.gross_amount)}</td>
                    <td className="px-4 py-2.5 text-muted text-right">{Number(c.tax_percent).toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-ink text-right font-semibold">Rp{rupiah(c.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
