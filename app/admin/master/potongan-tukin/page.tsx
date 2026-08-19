"use client";

import { useEffect, useState } from "react";

type Tier = { id: number; max_minutes: number | null; percent: string };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

function tierLabel(tier: Tier, prevMax: number | null): string {
  const from = prevMax === null ? 1 : prevMax + 1;
  if (tier.max_minutes === null) return `${from} menit ke atas`;
  return `${from}-${tier.max_minutes} menit`;
}

export default function PotonganTukinPage() {
  const [alpaPercent, setAlpaPercent] = useState("");
  const [alpaLoading, setAlpaLoading] = useState(true);
  const [alpaSaving, setAlpaSaving] = useState(false);

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMax, setEditMax] = useState("");
  const [editPercent, setEditPercent] = useState("");

  const [newMax, setNewMax] = useState("");
  const [newPercent, setNewPercent] = useState("");
  const [newError, setNewError] = useState("");
  const [newSubmitting, setNewSubmitting] = useState(false);

  function loadSettings() {
    setAlpaLoading(true);
    return fetch("/api/admin/tukin-settings")
      .then((r) => r.json())
      .then((d) => setAlpaPercent(d.settings?.alpa_deduction_percent ?? ""))
      .finally(() => setAlpaLoading(false));
  }

  function loadTiers() {
    setTiersLoading(true);
    return fetch("/api/admin/master/tukin-tiers")
      .then((r) => r.json())
      .then((d) => setTiers(d.tiers ?? []))
      .finally(() => setTiersLoading(false));
  }

  useEffect(() => {
    loadSettings();
    loadTiers();
  }, []);

  async function saveAlpa(e: React.FormEvent) {
    e.preventDefault();
    setAlpaSaving(true);
    try {
      await fetch("/api/admin/tukin-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alpa_deduction_percent: alpaPercent }),
      });
      loadSettings();
    } finally {
      setAlpaSaving(false);
    }
  }

  async function saveTier(id: number) {
    await fetch(`/api/admin/master/tukin-tiers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_minutes: editMax || null, percent: editPercent }),
    });
    setEditingId(null);
    loadTiers();
  }

  async function addTier(e: React.FormEvent) {
    e.preventDefault();
    setNewError("");
    setNewSubmitting(true);
    try {
      const res = await fetch("/api/admin/master/tukin-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_minutes: newMax || null, percent: newPercent }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewError(data.error || "Gagal menyimpan.");
        return;
      }
      setNewMax("");
      setNewPercent("");
      loadTiers();
    } catch {
      setNewError("Terjadi kesalahan jaringan.");
    } finally {
      setNewSubmitting(false);
    }
  }

  async function deleteTier(id: number) {
    if (!confirm("Hapus tier ini?")) return;
    await fetch(`/api/admin/master/tukin-tiers/${id}`, { method: "DELETE" });
    loadTiers();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-display text-[28px] leading-tight text-ink mb-2">Potongan Tukin</h1>
      <p className="text-[14px] text-muted max-w-lg mb-6">
        Aturan persentase potongan tukin yang dipakai kalkulasi di menu Tukin -- tier
        keterlambatan/pulang cepat berdasarkan menit, dan persentase untuk hari kerja
        tanpa data presensi sama sekali (alpa). Potongan cuti/izin diatur per jenis di
        menu Jenis Cuti.
      </p>

      <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-8">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
          Alpa (tanpa keterangan)
        </p>
        {alpaLoading ? (
          <p className="text-[14px] text-muted">Memuat…</p>
        ) : (
          <form onSubmit={saveAlpa} className="flex items-end gap-3">
            <label className="block">
              <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Persentase (%)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                className={inputClass + " w-40"}
                value={alpaPercent}
                onChange={(e) => setAlpaPercent(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={alpaSaving}
              className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60"
            >
              {alpaSaving ? "Menyimpan…" : "Simpan"}
            </button>
          </form>
        )}
      </section>

      <section>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
          Tier keterlambatan / pulang cepat
        </p>
        <form onSubmit={addTier} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-4 flex items-end gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Batas atas (menit)</span>
            <input
              type="number"
              min="0"
              placeholder="tanpa batas"
              className={inputClass + " w-40"}
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Persentase (%)</span>
            <input type="number" min="0" step="0.25" className={inputClass + " w-32"} value={newPercent} onChange={(e) => setNewPercent(e.target.value)} required />
          </label>
          <button
            type="submit"
            disabled={newSubmitting}
            className="rounded-full bg-cardGreen px-5 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60"
          >
            {newSubmitting ? "Menyimpan…" : "Tambah tier"}
          </button>
          {newError && <p className="text-[13px] text-red-700">{newError}</p>}
        </form>
        {tiersLoading ? (
          <p className="text-[14px] text-muted">Memuat…</p>
        ) : (
          <div className="rounded-card border border-cardGreenDark/20 overflow-hidden">
            <table className="w-full text-[13.5px]">
              <thead className="bg-pineLight text-ink">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Rentang menit</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Batas atas (menit)</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Persentase (%)</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) =>
                  editingId === t.id ? (
                    <tr key={t.id} className="border-t border-cardGreenDark/10 bg-pineLight/40">
                      <td className="px-4 py-2.5 text-muted">{tierLabel(t, tiers[i - 1]?.max_minutes ?? null)}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min="0"
                          placeholder="tanpa batas"
                          className={inputClass}
                          value={editMax}
                          onChange={(e) => setEditMax(e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input type="number" min="0" step="0.25" className={inputClass} value={editPercent} onChange={(e) => setEditPercent(e.target.value)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button onClick={() => saveTier(t.id)} className="rounded-full bg-cardGreen px-3 py-1.5 text-[12px] font-semibold text-canvas">Simpan</button>
                          <button onClick={() => setEditingId(null)} className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink">Batal</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} className="border-t border-cardGreenDark/10">
                      <td className="px-4 py-2.5 text-ink">{tierLabel(t, tiers[i - 1]?.max_minutes ?? null)}</td>
                      <td className="px-4 py-2.5 text-muted">{t.max_minutes ?? "tanpa batas"}</td>
                      <td className="px-4 py-2.5 text-muted">{t.percent}%</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(t.id);
                              setEditMax(t.max_minutes?.toString() ?? "");
                              setEditPercent(t.percent);
                            }}
                            className="rounded-full border border-cardGreenDark/30 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cardGreenDark/10"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTier(t.id)}
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
        )}
      </section>
    </div>
  );
}
