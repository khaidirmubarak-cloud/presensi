"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Pagination from "../../../components/Pagination";

type Pegawai = {
  id: string;
  name: string;
  nip: string | null;
  department: string | null;
  status: string;
  phone_number: string | null;
  employee_category: string | null;
  employment_status: string | null;
  rank_code: string | null;
  unit_name: string | null;
  position_title: string | null;
};

const PAGE_SIZES = [10, 50, 100];

export default function AdminPegawaiPage() {
  const [pegawai, setPegawai] = useState<Pegawai[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [nip, setNip] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadPegawai = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (category) params.set("category", category);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    return fetch(`/api/admin/pegawai?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setPegawai(d.pegawai ?? []);
        setTotal(d.total ?? 0);
        setCategories(d.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, category, page, pageSize]);

  useEffect(() => {
    loadPegawai();
  }, [loadPegawai]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/pegawai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, nip }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal menambahkan pegawai.");
        return;
      }

      setName("");
      setNip("");
      loadPegawai();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncSevima() {
    setSyncError("");
    setSyncMessage("");
    setSyncing(true);

    try {
      const res = await fetch("/api/admin/pegawai/sync-sevima", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setSyncError(data.error || "Gagal sinkronisasi dari Sevima.");
        return;
      }

      setSyncMessage(
        `${data.created} pegawai baru ditambahkan, ${data.skipped} sudah terdaftar (dilewati)` +
          (data.emailsLinked ? `, ${data.emailsLinked} email login (Google) baru dihubungkan` : "") +
          "." +
          (data.emailNote ? ` ${data.emailNote}` : ""),
      );
      loadPegawai();
    } catch {
      setSyncError("Terjadi kesalahan jaringan.");
    } finally {
      setSyncing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">

      <header className="mb-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">Data Pegawai</h1>
        <p className="mt-1.5 text-[14px] text-muted max-w-lg">
          Pusat pengelolaan pegawai dan akun login. Tambahkan pegawai baru (nama + NIP) atau
          sinkronkan dari Sevima, lalu lengkapi golongan/unit/jabatan dan nomor WhatsApp lewat
          halaman detail. Pegawai masuk ke dashboard Laporan Kinerja Harian dengan akun SIAKAD atau
          Google, lalu menghubungkan WhatsApp-nya sendiri dari sana.
        </p>
      </header>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 shadow-[0_1px_0_rgba(28,37,33,0.04)] p-5 mb-6">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-3">
          Sinkronisasi dari Sevima
        </p>
        <p className="text-[13px] text-muted mb-3 max-w-lg">
          Ambil data NIP dan nama pegawai/dosen dari Sevima. Pegawai yang NIP-nya sudah terdaftar
          tidak akan diubah.
        </p>
        {syncError && <p className="text-[13px] text-red-700 mb-3">{syncError}</p>}
        {syncMessage && <p className="text-[13px] text-cardGreenDark mb-3">{syncMessage}</p>}
        <button
          type="button"
          onClick={handleSyncSevima}
          disabled={syncing}
          className="rounded-full border border-cardGreenDark/30 bg-pineLight px-5 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors disabled:opacity-60"
        >
          {syncing ? "Menyinkronkan…" : "Sync dari Sevima"}
        </button>
      </section>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 shadow-[0_1px_0_rgba(28,37,33,0.04)] p-5 mb-10">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
          Tambah pegawai baru
        </p>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nama lengkap</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
            />
          </label>

          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">NIP</span>
            <input
              type="text"
              required
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              className="w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30"
            />
          </label>

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60"
            >
              {submitting ? "Menyimpan…" : "Tambah pegawai"}
            </button>
          </div>

          {error && <p className="sm:col-span-3 text-[13px] text-red-700">{error}</p>}
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
            Daftar pegawai ({total})
          </p>

          <div className="flex flex-wrap items-center gap-3">
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
                <option key={c} value={c}>
                  {c}
                </option>
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
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <p className="text-[14px] text-muted">Memuat…</p>
        ) : pegawai.length === 0 ? (
          <p className="text-[14px] text-muted">
            {debouncedSearch || category ? "Tidak ada pegawai yang cocok." : "Belum ada pegawai."}
          </p>
        ) : (
          <div className="rounded-card border border-cardGreenDark/20 overflow-hidden overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-pineLight text-ink">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
                  <th className="text-left px-4 py-2.5 font-semibold">NIP</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Kategori</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Golongan</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold">WhatsApp</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pegawai.map((p) => (
                  <tr key={p.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted">{p.nip ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted">{p.employee_category ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted">{p.rank_code ?? "-"}</td>
                    <td className="px-4 py-2.5 text-muted">{p.unit_name ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                          p.employment_status === "nonaktif"
                            ? "bg-red-100 text-red-800"
                            : "bg-pineLight text-ink"
                        }`}
                      >
                        {p.employment_status === "nonaktif" ? "Nonaktif" : "Aktif"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                          p.status === "active" && p.phone_number ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {p.status === "active" && p.phone_number ? "Terhubung" : "Belum"}
                      </span>
                      {p.phone_number ? <span className="block mt-1 text-[11.5px] text-muted">{p.phone_number}</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/pegawai/${p.id}`}
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
        )}

        {!loading && total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        )}
      </section>
    </div>
  );
}
