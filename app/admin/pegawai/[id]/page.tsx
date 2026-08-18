"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminNav from "../../../../components/AdminNav";

// Nilai persis apa adanya seperti tersimpan di kolom (bukan enum ternormalisasi) --
// disamakan dengan cara migrate-from-cobakinerja.ts menyimpannya (normalizeStr(u.status)
// verbatim), supaya dropdown ini cocok dengan data hasil migrasi, bukan malah kosong
// karena beda ejaan/spasi/huruf besar-kecil. Daftar awal (PNS/CPNS/NONPNS/DOSEN_TNP/dst.)
// diambil dari dropdown form cobakinerja lama, MUWAJJIH/MAGANG/PPPK PW ditambahkan
// setelah ketahuan lewat data 543 baris asli (sebelumnya tidak ada di form manapun).
const EMPLOYEE_CATEGORIES = [
  "PNS",
  "CPNS",
  "NONPNS",
  "Dosen TNP",
  "PPPK",
  "PPPK PW",
  "DOKTER",
  "DRIVER",
  "Labschool",
  "SECURITY",
  "KLINIK",
  "MUWAJJIH",
  "MAGANG",
];

type PegawaiDetail = {
  id: string;
  name: string;
  nip: string | null;
  department: string | null;
  status: string;
  phone_number: string | null;
  nip_lama: string | null;
  nidn: string | null;
  bank_account_no: string | null;
  npwp: string | null;
  birth_date: string | null;
  rank_id: string | null;
  unit_id: string | null;
  job_class_id: number | null;
  functional_position_id: string | null;
  tukin_nonpns_grade_id: number | null;
  position_title: string | null;
  position_effective_date: string | null;
  rank_effective_date: string | null;
  service_years: number | null;
  service_months: number | null;
  retirement_date: string | null;
  employee_category: string | null;
  employment_status: string | null;
  is_pegawai: number | null;
  is_dosen: number | null;
  is_serdos: number | null;
  lecturer_type: string | null;
  uses_shift: number | null;
  gets_meal_allowance: number | null;
  tukin_grade: number | null;
};

type Option = { id: string | number; label: string };

function toDateInput(v: string | null): string {
  if (!v) return "";
  return v.slice(0, 10);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-full border border-cardGreenDark/20 bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function PegawaiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [ranks, setRanks] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [jobClasses, setJobClasses] = useState<Option[]>([]);
  const [functionalPositions, setFunctionalPositions] = useState<Option[]>([]);
  const [tukinGrades, setTukinGrades] = useState<Option[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/pegawai/${params.id}`).then((r) => r.json()),
      fetch("/api/admin/master/golongan").then((r) => r.json()),
      fetch("/api/admin/master/unit").then((r) => r.json()),
      fetch("/api/admin/master/job-classes").then((r) => r.json()),
      fetch("/api/admin/master/functional-positions").then((r) => r.json()),
      fetch("/api/admin/master/tukin-nonpns-grade").then((r) => r.json()),
    ])
      .then(([pegawaiRes, golonganRes, unitRes, jobClassRes, fpRes, tukinRes]) => {
        const p: PegawaiDetail = pegawaiRes.pegawai;
        setForm({
          ...p,
          birth_date: toDateInput(p.birth_date),
          position_effective_date: toDateInput(p.position_effective_date),
          rank_effective_date: toDateInput(p.rank_effective_date),
          retirement_date: toDateInput(p.retirement_date),
        });
        setRanks((golonganRes.ranks ?? []).map((r: any) => ({ id: r.id, label: `${r.id} — ${r.code}` })));
        setUnits((unitRes.units ?? []).map((u: any) => ({ id: u.id, label: u.name })));
        setJobClasses((jobClassRes.jobClasses ?? []).map((c: any) => ({ id: c.id, label: c.name })));
        setFunctionalPositions(
          (fpRes.functionalPositions ?? []).map((f: any) => ({ id: f.id, label: f.name })),
        );
        setTukinGrades((tukinRes.grades ?? []).map((g: any) => ({ id: g.id, label: g.name })));
      })
      .catch(() => setError("Gagal memuat data."))
      .finally(() => setLoading(false));
  }, [params.id]);

  function set(field: string, value: any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/pegawai/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal menyimpan.");
        return;
      }

      setMessage("Data pegawai tersimpan.");
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <AdminNav />
        <p className="text-[14px] text-muted">Memuat…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <AdminNav />

      <header className="mb-8">
        <Link href="/admin/pegawai" className="text-[13px] font-semibold text-pine hover:underline">
          ← Kembali ke daftar pegawai
        </Link>
        <h1 className="font-display text-[28px] leading-tight text-ink mt-2">{form.name}</h1>
        <p className="mt-1 text-[13px] text-muted">
          Status akun login: {form.status === "active" ? "Aktif" : "Pending"}
          {form.phone_number ? ` · ${form.phone_number}` : ""}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">Identitas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nama lengkap">
              <input className={inputClass} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="NIP">
              <input className={inputClass} value={form.nip ?? ""} onChange={(e) => set("nip", e.target.value)} required />
            </Field>
            <Field label="NIP lama">
              <input className={inputClass} value={form.nip_lama ?? ""} onChange={(e) => set("nip_lama", e.target.value)} />
            </Field>
            <Field label="NIDN">
              <input className={inputClass} value={form.nidn ?? ""} onChange={(e) => set("nidn", e.target.value)} />
            </Field>
            <Field label="Departemen">
              <input className={inputClass} value={form.department ?? ""} onChange={(e) => set("department", e.target.value)} />
            </Field>
            <Field label="Tanggal lahir">
              <input type="date" className={inputClass} value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
            </Field>
            <Field label="No. rekening">
              <input className={inputClass} value={form.bank_account_no ?? ""} onChange={(e) => set("bank_account_no", e.target.value)} />
            </Field>
            <Field label="NPWP">
              <input className={inputClass} value={form.npwp ?? ""} onChange={(e) => set("npwp", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
            Kategori & klasifikasi
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Kategori pegawai">
              <select className={inputClass} value={form.employee_category ?? ""} onChange={(e) => set("employee_category", e.target.value)}>
                <option value="">— pilih —</option>
                {EMPLOYEE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Status kepegawaian">
              <select className={inputClass} value={form.employment_status ?? "aktif"} onChange={(e) => set("employment_status", e.target.value)}>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </Field>
            <Field label="Golongan">
              <select className={inputClass} value={form.rank_id ?? ""} onChange={(e) => set("rank_id", e.target.value)}>
                <option value="">— pilih —</option>
                {ranks.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Unit kerja">
              <select className={inputClass} value={form.unit_id ?? ""} onChange={(e) => set("unit_id", e.target.value)}>
                <option value="">— pilih —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Kelas jabatan">
              <select className={inputClass} value={form.job_class_id ?? ""} onChange={(e) => set("job_class_id", e.target.value)}>
                <option value="">— pilih —</option>
                {jobClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Jabatan fungsional">
              <select className={inputClass} value={form.functional_position_id ?? ""} onChange={(e) => set("functional_position_id", e.target.value)}>
                <option value="">— pilih —</option>
                {functionalPositions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Jabatan (nama bebas)">
              <input className={inputClass} value={form.position_title ?? ""} onChange={(e) => set("position_title", e.target.value)} placeholder="mis. Kasubag TU" />
            </Field>
            <Field label="Grade tukin non-ASN">
              <select className={inputClass} value={form.tukin_nonpns_grade_id ?? ""} onChange={(e) => set("tukin_nonpns_grade_id", e.target.value)}>
                <option value="">— tidak berlaku —</option>
                {tukinGrades.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">
            Riwayat & tanggal
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="TMT jabatan">
              <input type="date" className={inputClass} value={form.position_effective_date ?? ""} onChange={(e) => set("position_effective_date", e.target.value)} />
            </Field>
            <Field label="TMT pangkat">
              <input type="date" className={inputClass} value={form.rank_effective_date ?? ""} onChange={(e) => set("rank_effective_date", e.target.value)} />
            </Field>
            <Field label="Masa kerja (tahun)">
              <input type="number" min={0} className={inputClass} value={form.service_years ?? ""} onChange={(e) => set("service_years", e.target.value)} />
            </Field>
            <Field label="Masa kerja (bulan)">
              <input type="number" min={0} max={11} className={inputClass} value={form.service_months ?? ""} onChange={(e) => set("service_months", e.target.value)} />
            </Field>
            <Field label="TMT pensiun">
              <input type="date" className={inputClass} value={form.retirement_date ?? ""} onChange={(e) => set("retirement_date", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-card bg-panel border border-cardGreenDark/20 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted mb-4">Flag</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["is_pegawai", "Pegawai"],
              ["is_dosen", "Dosen"],
              ["is_serdos", "Sudah sertifikasi dosen (serdos)"],
              ["uses_shift", "Kerja shift"],
              ["gets_meal_allowance", "Berhak uang makan"],
            ].map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={!!form[field]}
                  onChange={(e) => set(field, e.target.checked)}
                  className="h-4 w-4 rounded border-cardGreenDark/30 text-cardGreen focus:ring-pine/30"
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        {error && <p className="text-[13px] text-red-700">{error}</p>}
        {message && <p className="text-[13px] text-cardGreenDark">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-cardGreen px-6 py-2.5 text-[13.5px] font-semibold text-canvas hover:bg-cardGreenDark transition-colors disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </form>
    </main>
  );
}
