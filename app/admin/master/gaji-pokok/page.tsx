"use client";

import { useEffect, useState } from "react";
import Pagination from "../../../../components/Pagination";

type Scale = { id: number; rank_id: string; rank_code: string; years: number; nominal: string };
type Rank = { id: string; code: string; title: string };

const PAGE_SIZES = [10, 50, 100];

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

function rupiah(value: string | number): string {
  return Number(value).toLocaleString("id-ID");
}

export default function GajiPokokPage() {
  const [scales, setScales] = useState<Scale[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterRank, setFilterRank] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [rankId, setRankId] = useState("");
  const [years, setYears] = useState("");
  const [nominal, setNominal] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editYears, setEditYears] = useState("");
  const [editNominal, setEditNominal] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRank) params.set("rank_id", filterRank);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return fetch(`/api/admin/master/gaji-pokok?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setScales(d.scales ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [filterRank, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [filterRank]);

  useEffect(() => {
    fetch("/api/admin/master/golongan")
      .then((r) => r.json())
      .then((d) => setRanks(d.ranks ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/master/gaji-pokok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank_id: rankId, years: Number(years), nominal: Number(nominal) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setRankId("");
      setYears("");
      setNominal("");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: number) {
    await fetch(`/api/admin/master/gaji-pokok/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ years: Number(editYears), nominal: Number(editNominal) }),
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Hapus baris gaji pokok "${label}"?`)) return;
    await fetch(`/api/admin/master/gaji-pokok/${id}`, { method: "DELETE" });
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-display text-[28px] leading-tight text-ink mb-2">Gaji Pokok</h1>
      <p className="text-[14px] text-muted max-w-lg mb-6">
        Nominal gaji pokok per golongan x masa kerja. Dipakai untuk menghitung "potongan
        awal" dosen serdos di menu Tunjangan Kinerja.
      </p>

      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Golongan</span>
          <select className={inputClass} value={rankId} onChange={(e) => setRankId(e.target.value)} required>
            <option value="">— pilih —</option>
            {ranks.map((r) => (
              <option key={r.id} value={r.id}>{r.code}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Masa kerja (tahun)</span>
          <input type="number" min="0" className={inputClass} value={years} onChange={(e) => setYears(e.target.value)} required />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nominal (Rp)</span>
          <input type="number" min="0" className={inputClass} value={nominal} onChange={(e) => setNominal(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting} className="sm:col-span-4 rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit">
          {submitting ? "Menyimpan…" : "Tambah"}
        </button>
        {error && <p className="sm:col-span-4 text-[13px] text-red-700">{error}</p>}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <select value={filterRank} onChange={(e) => setFilterRank(e.target.value)} className={inputClass + " w-fit"}>
          <option value="">Semua golongan</option>
          {ranks.map((r) => (
            <option key={r.id} value={r.id}>{r.code}</option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-muted">{total} baris</span>
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
        </div>
      </div>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : scales.length === 0 ? (
        <p className="text-[14px] text-muted">Belum ada data gaji pokok.</p>
      ) : (
        <>
          <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-pineLight text-ink">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Golongan</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Masa Kerja</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Nominal</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {scales.map((s) =>
                  editingId === s.id ? (
                    <tr key={s.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                      <td className="px-4 py-2.5 text-ink">{s.rank_code}</td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" className={inputClass} value={editYears} onChange={(e) => setEditYears(e.target.value)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" className={inputClass} value={editNominal} onChange={(e) => setEditNominal(e.target.value)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(s.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                          <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="border-t border-cardGreenDark/10">
                      <td className="px-4 py-2.5 text-ink">{s.rank_code}</td>
                      <td className="px-4 py-2.5 text-muted">{s.years} tahun</td>
                      <td className="px-4 py-2.5 text-muted text-right">Rp{rupiah(s.nominal)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(s.id);
                              setEditYears(String(s.years));
                              setEditNominal(s.nominal);
                            }}
                            className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, `${s.rank_code} - ${s.years} thn`)}
                            className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10"
                          >
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
