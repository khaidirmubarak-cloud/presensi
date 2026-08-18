"use client";

import { useEffect, useState } from "react";
import AdminNav from "../../../../components/AdminNav";

type JobClass = { id: number; name: string };
type FunctionalPosition = { id: string; name: string; job_class_id: number | null; job_class_name: string | null };

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

function JobClassTab() {
  const [items, setItems] = useState<JobClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    return fetch("/api/admin/master/job-classes")
      .then((r) => r.json())
      .then((d) => setItems(d.jobClasses ?? []))
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
      const res = await fetch("/api/admin/master/job-classes", {
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

  async function handleDelete(cid: number) {
    if (!confirm(`Hapus kelas jabatan "${cid}"?`)) return;
    await fetch(`/api/admin/master/job-classes/${cid}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">ID kelas</span>
          <input type="number" className={inputClass} value={id} onChange={(e) => setId(e.target.value)} required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nama kelas</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
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
                <th className="text-left px-4 py-2.5 font-semibold">Nama kelas</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-ink">{c.id}</td>
                  <td className="px-4 py-2.5 text-muted">{c.name}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleDelete(c.id)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
                      Hapus
                    </button>
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

function FunctionalPositionTab() {
  const [items, setItems] = useState<FunctionalPosition[]>([]);
  const [jobClasses, setJobClasses] = useState<JobClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [jobClassId, setJobClassId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    return Promise.all([
      fetch("/api/admin/master/functional-positions").then((r) => r.json()),
      fetch("/api/admin/master/job-classes").then((r) => r.json()),
    ])
      .then(([fpRes, jcRes]) => {
        setItems(fpRes.functionalPositions ?? []);
        setJobClasses(jcRes.jobClasses ?? []);
      })
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
      const res = await fetch("/api/admin/master/functional-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, job_class_id: jobClassId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }
      setId("");
      setName("");
      setJobClassId("");
      load();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(fid: string) {
    if (!confirm(`Hapus jabatan fungsional "${fid}"?`)) return;
    await fetch(`/api/admin/master/functional-positions/${fid}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="rounded-card bg-panel border border-cardGreenDark/20 p-5 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">ID</span>
          <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} required />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nama jabatan fungsional</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Kelas jabatan</span>
          <select className={inputClass} value={jobClassId} onChange={(e) => setJobClassId(e.target.value)}>
            <option value="">— pilih —</option>
            {jobClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
                <th className="text-left px-4 py-2.5 font-semibold">Nama</th>
                <th className="text-left px-4 py-2.5 font-semibold">Kelas jabatan</th>
                <th className="text-left px-4 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className="border-t border-cardGreenDark/10">
                  <td className="px-4 py-2.5 text-ink">{f.id}</td>
                  <td className="px-4 py-2.5 text-muted">{f.name}</td>
                  <td className="px-4 py-2.5 text-muted">{f.job_class_name ?? "-"}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleDelete(f.id)} className="rounded-full border border-red-700/30 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-700/10">
                      Hapus
                    </button>
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

export default function JabatanPage() {
  const [tab, setTab] = useState<"kelas" | "fungsional">("kelas");

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <AdminNav />
      <h1 className="font-display text-[28px] leading-tight text-ink mb-6">Jabatan</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("kelas")}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            tab === "kelas" ? "bg-cardGreen text-canvas" : "border border-cardGreenDark/30 text-ink"
          }`}
        >
          Kelas Jabatan
        </button>
        <button
          onClick={() => setTab("fungsional")}
          className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            tab === "fungsional" ? "bg-cardGreen text-canvas" : "border border-cardGreenDark/30 text-ink"
          }`}
        >
          Jabatan Fungsional
        </button>
      </div>

      {tab === "kelas" ? <JobClassTab /> : <FunctionalPositionTab />}
    </main>
  );
}
