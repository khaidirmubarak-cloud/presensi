"use client";

import { useEffect, useState } from "react";

type Rank = { id: string; code: string; title: string };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function GolonganPage() {
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editTitle, setEditTitle] = useState("");

  function load() {
    setLoading(true);
    return fetch("/api/admin/master/golongan")
      .then((r) => r.json())
      .then((d) => setRanks(d.ranks ?? []))
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
      const res = await fetch("/api/admin/master/golongan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, code, title }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setId("");
      setCode("");
      setTitle("");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(rid: string) {
    await fetch(`/api/admin/master/golongan/${rid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: editCode, title: editTitle }),
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(rid: string) {
    if (!confirm(`Hapus golongan "${rid}"?`)) return;
    await fetch(`/api/admin/master/golongan/${rid}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-display text-[28px] leading-tight text-ink mb-6">Golongan</h1>

      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">ID</span>
          <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} placeholder="3B" required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Kode</span>
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="III/b" required />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nama pangkat</span>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Penata Muda Tingkat I" required />
        </label>
        <button type="submit" disabled={submitting} className="sm:col-span-4 rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60 w-fit">
          {submitting ? "Menyimpan…" : "Tambah"}
        </button>
        {error && <p className="sm:col-span-4 text-[13px] text-red-700">{error}</p>}
      </form>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">ID</th>
                <th className="text-left px-4 py-2.5 font-semibold">Kode</th>
                <th className="text-left px-4 py-2.5 font-semibold">Nama pangkat</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                    <td className="px-4 py-2.5">{r.id}</td>
                    <td className="px-4 py-2.5"><input className={inputClass} value={editCode} onChange={(e) => setEditCode(e.target.value)} /></td>
                    <td className="px-4 py-2.5"><input className={inputClass} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(r.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                        <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{r.id}</td>
                    <td className="px-4 py-2.5 text-muted">{r.code}</td>
                    <td className="px-4 py-2.5 text-muted">{r.title}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditCode(r.code);
                            setEditTitle(r.title);
                          }}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
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
    </div>
  );
}
