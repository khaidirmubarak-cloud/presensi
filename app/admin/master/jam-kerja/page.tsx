"use client";

import { useEffect, useState } from "react";
import AdminNav from "../../../../components/AdminNav";

type Rule = {
  id: number;
  day_type: "weekday" | "friday";
  period_type: "normal" | "ramadhan";
  check_in_time: string;
  check_out_time: string;
};

const DAY_LABEL: Record<Rule["day_type"], string> = { weekday: "Senin-Kamis", friday: "Jumat" };
const PERIOD_LABEL: Record<Rule["period_type"], string> = { normal: "Normal", ramadhan: "Ramadhan" };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function JamKerjaPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");

  function load() {
    setLoading(true);
    return fetch("/api/admin/master/jam-kerja")
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function saveEdit(id: number) {
    await fetch(`/api/admin/master/jam-kerja/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_in_time: editIn, check_out_time: editOut }),
    });
    setEditingId(null);
    load();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <AdminNav />
      <h1 className="font-display text-[28px] leading-tight text-ink mb-2">Jam Kerja</h1>
      <p className="text-[14px] text-muted max-w-lg mb-6">
        Dipakai untuk menghitung status Terlambat/Pulang Cepat di halaman Presensi. Masa Ramadhan
        ditentukan otomatis dari menu Ramadhan.
      </p>

      {loading ? (
        <p className="text-[14px] text-muted">Memuat…</p>
      ) : (
        <div className="rounded-card border border-cardGreenDark/20 overflow-hidden">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pineLight text-ink">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Hari</th>
                <th className="text-left px-4 py-2.5 font-semibold">Masa</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Masuk</th>
                <th className="text-left px-4 py-2.5 font-semibold">Jam Pulang</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                    <td className="px-4 py-2.5 text-ink">{DAY_LABEL[r.day_type]}</td>
                    <td className="px-4 py-2.5 text-ink">{PERIOD_LABEL[r.period_type]}</td>
                    <td className="px-4 py-2.5"><input type="time" className={inputClass} value={editIn} onChange={(e) => setEditIn(e.target.value)} /></td>
                    <td className="px-4 py-2.5"><input type="time" className={inputClass} value={editOut} onChange={(e) => setEditOut(e.target.value)} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(r.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                        <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className="border-t border-cardGreenDark/10">
                    <td className="px-4 py-2.5 text-ink">{DAY_LABEL[r.day_type]}</td>
                    <td className="px-4 py-2.5 text-muted">{PERIOD_LABEL[r.period_type]}</td>
                    <td className="px-4 py-2.5 text-muted">{r.check_in_time.slice(0, 5)}</td>
                    <td className="px-4 py-2.5 text-muted">{r.check_out_time.slice(0, 5)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => {
                          setEditingId(r.id);
                          setEditIn(r.check_in_time.slice(0, 5));
                          setEditOut(r.check_out_time.slice(0, 5));
                        }}
                        className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                      >
                        Edit
                      </button>
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
