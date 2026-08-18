"use client";

import { useEffect, useState } from "react";
import AdminNav from "../../../../components/AdminNav";

type Grade = { id: number; name: string };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function TukinNonpnsGradePage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  function load() {
    setLoading(true);
    return fetch("/api/admin/master/tukin-nonpns-grade")
      .then((r) => r.json())
      .then((d) => setGrades(d.grades ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/master/tukin-nonpns-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setId("");
      setName("");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(gid: number) {
    await fetch(`/api/admin/master/tukin-nonpns-grade/${gid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(gid: number) {
    if (!confirm(`Hapus grade "${gid}"?`)) return;
    await fetch(`/api/admin/master/tukin-nonpns-grade/${gid}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <AdminNav />
      <h1 className="font-display text-[28px] leading-tight text-ink mb-2">Grade Tukin Non-ASN</h1>
      <p className="text-[13px] text-muted mb-6">
        Dipakai untuk pegawai non-ASN (driver, satpam, petugas klinik, dokter, staf mahad, dll.)
        yang perhitungan tukin-nya beda alur dari pegawai ASN.
      </p>

      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">ID grade</span>
          <input type="number" className={inputClass} value={id} onChange={(e) => setId(e.target.value)} required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nama grade</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Supir" required />
        </label>
        <button type="submit" disabled={submitting} className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit">
          {submitting ? "Menyimpan…" : "Tambah"}
        </button>
        {error && <p className="sm:col-span-3 text-[13px] text-red-700">{error}</p>}
      </form>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">ID</th>
                <th className="text-left px-4 py-2.5 font-semibold">Nama grade</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) =>
                editingId === g.id ? (
                  <tr key={g.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                    <td className="px-4 py-2.5">{g.id}</td>
                    <td className="px-4 py-2.5"><input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(g.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                        <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={g.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{g.id}</td>
                    <td className="px-4 py-2.5 text-muted">{g.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(g.id);
                            setEditName(g.name);
                          }}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(g.id)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
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
      )}
    </main>
  );
}
