"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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

type LoginEmail = { email: string; source: string; createdAt: string | null; lastLoginAt: string | null };

const EMAIL_SOURCE_LABEL: Record<string, string> = {
  sevima_login: "Login SIAKAD",
  sevima_email: "Sevima (email)",
  sevima_email_kampus: "Sevima (email kampus)",
  admin: "Ditambah admin",
};

type FingerInfo = {
  fingerId: number;
  owner: { id: string; name: string; nip: string | null } | null;
  lastScanAt: string | null;
  scans30d: number;
};

function formatScan(iso: string | null): string {
  if (!iso) return "belum pernah ada scan";
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Makassar",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso)) + " WITA"
  );
}

const inputClass =
  "w-full rounded-full border border-line bg-pineLight px-4 py-2 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-pine/30";

export default function PegawaiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Akun login (nomor WA + status klaim) -- disimpan terpisah dari form data kepegawaian,
  // lewat /api/admin/pegawai/[id]/akun yang punya aturan reset sendiri.
  const [akunPhone, setAkunPhone] = useState("");
  const [akunSaving, setAkunSaving] = useState(false);
  const [akunError, setAkunError] = useState("");
  const [akunMessage, setAkunMessage] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ID finger mesin presensi -- disimpan terpisah lewat /api/admin/pegawai/[id]/finger.
  const [fingerInput, setFingerInput] = useState("");
  const [fingerInfo, setFingerInfo] = useState<FingerInfo | null>(null);
  const [fingerCheck, setFingerCheck] = useState<FingerInfo | null>(null);
  const [fingerBusy, setFingerBusy] = useState<"cek" | "simpan" | null>(null);
  const [fingerError, setFingerError] = useState("");
  const [fingerMessage, setFingerMessage] = useState("");

  // Email login (Masuk dengan Google / SIAKAD di dashboard Laporan Kinerja Harian).
  const [loginEmails, setLoginEmails] = useState<LoginEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  useEffect(() => {
    fetch(`/api/admin/pegawai/${params.id}/emails`)
      .then((r) => r.json())
      .then((d) => setLoginEmails(d.emails ?? []))
      .catch(() => setEmailError("Gagal memuat email login."));
  }, [params.id]);

  const [ranks, setRanks] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [functionalPositions, setFunctionalPositions] = useState<
    { id: string; label: string; jobClassId: number | null; jobClassName: string | null }[]
  >([]);
  const [tukinGrades, setTukinGrades] = useState<Option[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/pegawai/${params.id}`).then((r) => r.json()),
      fetch("/api/admin/master/golongan").then((r) => r.json()),
      fetch("/api/admin/master/unit").then((r) => r.json()),
      fetch("/api/admin/master/functional-positions").then((r) => r.json()),
      fetch("/api/admin/master/tukin-nonpns-grade").then((r) => r.json()),
    ])
      .then(([pegawaiRes, golonganRes, unitRes, fpRes, tukinRes]) => {
        const p: PegawaiDetail = pegawaiRes.pegawai;
        setForm({
          ...p,
          birth_date: toDateInput(p.birth_date),
          position_effective_date: toDateInput(p.position_effective_date),
          rank_effective_date: toDateInput(p.rank_effective_date),
          retirement_date: toDateInput(p.retirement_date),
        });
        setAkunPhone(p.phone_number ?? "");
        setFingerInput(pegawaiRes.pegawai.finger_id != null ? String(pegawaiRes.pegawai.finger_id) : "");
        setFingerInfo(pegawaiRes.fingerInfo ?? null);
        setRanks((golonganRes.ranks ?? []).map((r: any) => ({ id: r.id, label: `${r.id} — ${r.code}` })));
        setUnits((unitRes.units ?? []).map((u: any) => ({ id: u.id, label: u.name })));
        setFunctionalPositions(
          (fpRes.functionalPositions ?? []).map((f: any) => ({
            id: f.id,
            label: f.name,
            jobClassId: f.job_class_id,
            jobClassName: f.job_class_name,
          })),
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

  async function handleSaveAkun(e: React.FormEvent) {
    e.preventDefault();
    setAkunError("");
    setAkunMessage("");

    setAkunSaving(true);
    try {
      const res = await fetch(`/api/admin/pegawai/${params.id}/akun`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: akunPhone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAkunError(data.error || "Gagal menyimpan akun.");
        return;
      }

      setForm((f) => ({ ...f, phone_number: data.akun.phone_number, status: data.akun.status }));
      setAkunPhone(data.akun.phone_number ?? "");
      setAkunMessage(
        data.akun.phone_number
          ? "Nomor WhatsApp tersimpan dan aktif untuk mengirim LKH."
          : "Nomor WhatsApp dikosongkan — pegawai tidak bisa mengirim LKH lewat WhatsApp sampai nomor dihubungkan lagi.",
      );
    } catch {
      setAkunError("Terjadi kesalahan jaringan.");
    } finally {
      setAkunSaving(false);
    }
  }

  async function handleCheckFinger() {
    setFingerError("");
    setFingerMessage("");
    setFingerCheck(null);
    if (!fingerInput.trim()) return;
    setFingerBusy("cek");
    try {
      const res = await fetch(`/api/admin/pegawai/finger-check?finger_id=${encodeURIComponent(fingerInput.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setFingerError(data.error || "Gagal mengecek ID finger.");
        return;
      }
      setFingerCheck(data.info);
    } catch {
      setFingerError("Terjadi kesalahan jaringan.");
    } finally {
      setFingerBusy(null);
    }
  }

  async function handleSaveFinger(e: React.FormEvent) {
    e.preventDefault();
    setFingerError("");
    setFingerMessage("");
    setFingerBusy("simpan");
    try {
      const res = await fetch(`/api/admin/pegawai/${params.id}/finger`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finger_id: fingerInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFingerError(data.error || "Gagal menyimpan ID finger.");
        return;
      }
      setFingerInfo(data.info ?? null);
      setFingerCheck(null);
      setForm((f) => ({ ...f, finger_id: data.finger_id }));
      setFingerMessage(
        data.finger_id === null
          ? "ID finger dikosongkan — scan mesin tidak akan terhitung untuk pegawai ini."
          : `ID finger ${data.finger_id} tersimpan.`,
      );
    } catch {
      setFingerError("Terjadi kesalahan jaringan.");
    } finally {
      setFingerBusy(null);
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailMessage("");
    setEmailBusy(true);
    try {
      const res = await fetch(`/api/admin/pegawai/${params.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || "Gagal menambah email.");
        return;
      }
      setLoginEmails(data.emails ?? []);
      setEmailMessage(`${newEmail.trim().toLowerCase()} ditambahkan — pegawai bisa langsung Masuk dengan Google memakai email ini.`);
      setNewEmail("");
    } catch {
      setEmailError("Terjadi kesalahan jaringan.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleRemoveEmail(email: string) {
    if (!confirm(`Hapus email login ${email}? Pegawai tidak bisa lagi Masuk dengan Google memakai email ini.`)) return;
    setEmailError("");
    setEmailMessage("");
    setEmailBusy(true);
    try {
      const res = await fetch(`/api/admin/pegawai/${params.id}/emails?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || "Gagal menghapus email.");
        return;
      }
      setLoginEmails(data.emails ?? []);
      setEmailMessage(`${email} dihapus.`);
    } catch {
      setEmailError("Terjadi kesalahan jaringan.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteError("");
    if (!confirm(`Hapus data pegawai "${form.name}" secara permanen? Tindakan ini tidak bisa dibatalkan.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/pegawai/${params.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(data.error || "Gagal menghapus pegawai.");
        return;
      }

      router.push("/admin/pegawai");
    } catch {
      setDeleteError("Terjadi kesalahan jaringan.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-[14px] text-muted">Memuat…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">

      <header className="mb-8">
        <Link href="/admin/pegawai" className="text-[13px] font-semibold text-pine hover:underline">
          ← Kembali ke daftar pegawai
        </Link>
        <h1 className="font-display font-extrabold text-[28px] leading-tight text-ink mt-2">{form.name}</h1>
      </header>

      <form onSubmit={handleSaveAkun} className="rounded-card bg-panel border border-line p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">WhatsApp LKH</p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              form.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {form.status === "active" && form.phone_number ? "Terhubung" : "Belum terhubung"}
          </span>
        </div>
        <p className="text-[12.5px] text-muted mb-4">
          Nomor WhatsApp untuk mengirim LKH melalui aplikasi WhatsApp.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-72">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Nomor WhatsApp</span>
            <input
              className={inputClass}
              value={akunPhone}
              onChange={(e) => setAkunPhone(e.target.value)}
              placeholder="mis. 6281234567890"
              inputMode="tel"
            />
          </label>
          <button
            type="submit"
            disabled={akunSaving}
            className="rounded-full border border-line bg-pineLight px-5 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-pineLight transition-colors disabled:opacity-60"
          >
            {akunSaving ? "Menyimpan…" : "Simpan nomor"}
          </button>
        </div>
        {akunError && <p className="mt-3 text-[13px] text-red-700">{akunError}</p>}
        {akunMessage && <p className="mt-3 text-[13px] text-cardGreenDark">{akunMessage}</p>}
      </form>

      <form onSubmit={handleSaveFinger} className="rounded-card bg-panel border border-line p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">ID Finger (mesin presensi)</p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              form.finger_id != null ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {form.finger_id != null ? `ID ${form.finger_id}` : "Belum ada ID finger"}
          </span>
        </div>
        <p className="text-[12.5px] text-muted mb-4">
          ID Finger berasal dari nomor yang tercatat pada mesin fingerprint. Jika terdapat ketidaksesuaian
          data, lakukan pencocokan pada database sumber (mesin fingerprint).
        </p>
        {form.finger_id != null && fingerInfo && (
          <p className="text-[12.5px] text-ink mb-4">
            Scan terakhir: <strong>{formatScan(fingerInfo.lastScanAt)}</strong> · {fingerInfo.scans30d} scan dalam 30 hari terakhir
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-48">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">ID finger</span>
            <input
              className={inputClass}
              value={fingerInput}
              onChange={(e) => {
                setFingerInput(e.target.value.replace(/\D/g, ""));
                setFingerCheck(null);
              }}
              placeholder="mis. 575"
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            onClick={handleCheckFinger}
            disabled={fingerBusy !== null || !fingerInput.trim()}
            className="rounded-full border border-line px-5 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-pineLight transition-colors disabled:opacity-60"
          >
            {fingerBusy === "cek" ? "Mengecek…" : "Cek"}
          </button>
          <button
            type="submit"
            disabled={fingerBusy !== null}
            className="rounded-full border border-line bg-pineLight px-5 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-pineLight transition-colors disabled:opacity-60"
          >
            {fingerBusy === "simpan" ? "Menyimpan…" : fingerInput.trim() ? "Simpan ID finger" : "Kosongkan ID finger"}
          </button>
        </div>
        {fingerCheck && (
          <div className="mt-3 rounded-2xl bg-pineLight/60 px-4 py-3 text-[12.5px] text-ink space-y-1">
            <p>
              <strong>ID {fingerCheck.fingerId}</strong>:{" "}
              {fingerCheck.owner
                ? fingerCheck.owner.id === params.id
                  ? "sudah terpasang di pegawai ini."
                  : `dipakai ${fingerCheck.owner.name}${fingerCheck.owner.nip ? ` (NIP ${fingerCheck.owner.nip})` : ""}.`
                : "belum dipakai pegawai mana pun."}
            </p>
            <p>
              Scan terakhir: {formatScan(fingerCheck.lastScanAt)} · {fingerCheck.scans30d} scan dalam 30 hari terakhir
            </p>
          </div>
        )}
        {fingerError && <p className="mt-3 text-[13px] text-red-700">{fingerError}</p>}
        {fingerMessage && <p className="mt-3 text-[13px] text-cardGreenDark">{fingerMessage}</p>}
      </form>

      <form onSubmit={handleAddEmail} className="rounded-card bg-panel border border-line p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Email login</p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              loginEmails.length > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {loginEmails.length > 0 ? `${loginEmails.length} email` : "Belum ada email"}
          </span>
        </div>
        <p className="text-[12.5px] text-muted mb-4">
          Email yang digunakan untuk login dan terisi otomatis dari akun SIAKAD Cloud. Tambahkan manual bila
          email belum tercatat.
        </p>

        {loginEmails.length > 0 && (
          <ul className="mb-4 divide-y divide-line rounded-2xl border border-line">
            {loginEmails.map((le) => (
              <li key={le.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] text-ink break-all">{le.email}</p>
                  <p className="text-[11.5px] text-muted">
                    {EMAIL_SOURCE_LABEL[le.source] ?? le.source}
                    {" · "}
                    {le.lastLoginAt ? `terakhir masuk ${formatScan(le.lastLoginAt)}` : "belum pernah dipakai masuk"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveEmail(le.email)}
                  disabled={emailBusy}
                  className="rounded-full border border-red-300 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-80">
            <span className="block text-[12.5px] font-semibold text-ink mb-1.5">Tambah email</span>
            <input
              type="email"
              className={inputClass}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nama@gmail.com atau nama@uinpalopo.ac.id"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <button
            type="submit"
            disabled={emailBusy || !newEmail.trim()}
            className="rounded-full border border-line bg-pineLight px-5 py-2.5 text-[13.5px] font-semibold text-ink hover:bg-pineLight transition-colors disabled:opacity-60"
          >
            {emailBusy ? "Menyimpan…" : "Tambah email"}
          </button>
        </div>
        {emailError && <p className="mt-3 text-[13px] text-red-700">{emailError}</p>}
        {emailMessage && <p className="mt-3 text-[13px] text-cardGreenDark">{emailMessage}</p>}
      </form>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-card bg-panel border border-line p-5">
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

        <section className="rounded-card bg-panel border border-line p-5">
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
            <Field label="Jabatan fungsional">
              <select
                className={inputClass}
                value={form.functional_position_id ?? ""}
                onChange={(e) => {
                  const fp = functionalPositions.find((f) => f.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    functional_position_id: e.target.value,
                    job_class_id: fp?.jobClassId ?? null,
                  }));
                }}
              >
                <option value="">— pilih —</option>
                {functionalPositions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <span className="mt-1.5 block text-[12px] text-muted">
                Kelas jabatan:{" "}
                {functionalPositions.find((f) => f.id === form.functional_position_id)?.jobClassName ??
                  "— mengikuti jabatan fungsional —"}
              </span>
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

        <section className="rounded-card bg-panel border border-line p-5">
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

        <section className="rounded-card bg-panel border border-line p-5">
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
                  className="h-4 w-4 rounded border-line text-cardGreen focus:ring-pine/30"
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

      <section className="mt-10 rounded-card border border-red-200 bg-red-50/40 p-5">
        <p className="font-mono text-[11px] uppercase tracking-wide text-red-800 mb-2">Hapus pegawai</p>
        <p className="text-[12.5px] text-muted mb-4">
          Hanya untuk data salah input atau dobel yang belum punya riwayat. Pegawai yang sudah
          punya laporan kinerja, presensi, cuti, atau perhitungan tunjangan tidak bisa dihapus —
          ubah "Status kepegawaian" menjadi Nonaktif.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-full border border-red-300 px-5 py-2 text-[13px] font-semibold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-60"
        >
          {deleting ? "Menghapus…" : "Hapus pegawai"}
        </button>
        {deleteError && <p className="mt-3 text-[13px] text-red-700">{deleteError}</p>}
      </section>
    </div>
  );
}
