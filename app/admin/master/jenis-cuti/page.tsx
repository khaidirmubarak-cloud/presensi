"use client";

import { useEffect, useState } from "react";

type LeaveType = { id: string; name: string; tukin_deduction_percent: number; sort_order: number };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function JenisCutiPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [deduction, setDeduction] = useState("0");
  const [sortOrder, setSortOrder] = useState("0");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDeduction, setEditDeduction] = useState("0");
  const [editSortOrder, setEditSortOrder] = useState("0");

  function load() {
    setLoading(true);
    return fetch("/api/admin/master/jenis-cuti")
      .then((r) => r.json())
      .then((d) => setLeaveTypes(d.leaveTypes ?? []))
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
      const res = await fetch("/api/admin/master/jenis-cuti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          tukin_deduction_percent: Number(deduction),
          sort_order: Number(sortOrder),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setId("");
      setName("");
      setDeduction("0");
      setSortOrder("0");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(tid: string) {
    await fetch(`/api/admin/master/jenis-cuti/${tid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        tukin_deduction_percent: Number(editDeduction),
        sort_order: Number(editSortOrder),
      }),
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(tid: string, label: string) {
    if (!confirm(`Hapus jenis cuti "${label}"?`)) return;
    await fetch(`/api/admin/master/jenis-cuti/${tid}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-display text-[28px] leading-tight text-ink mb-2">Jenis Cuti</h1>
      <p className="text-[14px] text-muted max-w-lg mb-6">
        Katalog jenis cuti/izin. Potongan tukin dipakai fase Tukin nanti, belum aktif dihitung
        di fase ini.
      </p>

      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Kode</span>
          <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} placeholder="C1" required />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nama</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cuti Tahunan" required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Potongan tukin (%)</span>
          <input type="number" step="0.01" className={inputClass} value={deduction} onChange={(e) => setDeduction(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Urutan</span>
          <input type="number" className={inputClass} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
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
                <th className="text-left px-4 py-2.5 font-semibold">Kode</th>
                <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
                <th className="text-left px-4 py-2.5 font-semibold">Potongan Tukin</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((t) =>
                editingId === t.id ? (
                  <tr key={t.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                    <td className="px-4 py-2.5 text-ink">{t.id}</td>
                    <td className="px-4 py-2.5"><input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                    <td className="px-4 py-2.5"><input type="number" step="0.01" className={inputClass} value={editDeduction} onChange={(e) => setEditDeduction(e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(t.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                        <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{t.id}</td>
                    <td className="px-4 py-2.5 text-muted">{t.name}</td>
                    <td className="px-4 py-2.5 text-muted">{t.tukin_deduction_percent}%</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(t.id);
                            setEditName(t.name);
                            setEditDeduction(String(t.tukin_deduction_percent));
                            setEditSortOrder(String(t.sort_order));
                          }}
                          className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDelete(t.id, t.name)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
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
