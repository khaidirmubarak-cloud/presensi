import { cleanNip, isExcludedNip } from "./nip";

// Client untuk API Sevima Siakad Cloud, dipakai admin untuk sinkronisasi data pegawai
// awal ke tabel employees (lihat app/api/admin/pegawai/sync-sevima/route.ts). Dipindah
// dari dashboard-kinerja -- pengelolaan akun pegawai sekarang terpusat di aplikasi ini.
//
// Dua sumber data terpisah — staf non-akademik di /pegawai, dosen di /dosen — dengan
// bentuk attributes yang sama. PERHATIAN: di /dosen, field "nip" untuk ±72% dosen berisi
// NIDN (10 digit), bukan NIP -- termasuk dosen ASN; NIP resminya kadang ada di "nip_pns"
// (jarang terisi). Karena itu tiap record membawa semua identitasnya (ids: nip, nip_pns,
// nidn, nidk) untuk dicocokkan ke employees.nip / employee_profiles.nidn / nip_lama, dan NIP
// utamanya memakai nip_pns bila berupa NIP 18 digit (diukur 2026-11-12: 287 dosen non-LB,
// 208 nip=NIDN, hanya 16 di antaranya punya nip_pns).
//
// Response BUKAN JSON:API standar walau bentuknya mirip — halaman berikutnya ada di
// "urls.next" (bukan "links.next"), dan total/halaman ada di "meta".

type SevimaAttributes = {
  id_pegawai: number;
  nip: string;
  nama: string;
  email?: string | null;
  email_kampus?: string | null;
  nip_pns?: string | null;
  nidn?: string | null;
  nidk?: string | null;
  no_akun_finger?: string | number | null; // ID pegawai di mesin fingerprint (sama dengan employees.finger_id)
  id_status_aktif?: string | null; // AA = Aktif; TA = Tidak Aktif, M = Meninggal Dunia, PN = Pensiun Normal, dst.
  status_aktif?: string | null;
};

type SevimaRecord = {
  type: string;
  id: number;
  attributes: SevimaAttributes;
};

type SevimaListResponse = {
  data: SevimaRecord[];
  urls?: { next?: string | null };
};

export type SevimaEmployee = {
  sevimaId: number; // id_pegawai Sevima -- kunci endpoint presensi-pegawai/{id_pegawai}-{tanggal}
  fingerId: number | null; // no_akun_finger, null kalau kosong/bukan angka
  nip: string; // NIP utama (nip_pns 18 digit bila ada, selain itu field "nip" Sevima)
  ids: string[]; // semua identitas bersih untuk pencocokan: nip, nip_pns, nidn, nidk
  name: string;
  // Hanya akun Aktif (id_status_aktif "AA") yang diimpor. Satu orang bisa punya akun lama yang
  // tidak aktif di Sevima (mis. TA/M/PN) -- akun itu tidak boleh membuat pegawai baru.
  active: boolean;
  statusLabel: string;
  // Dipakai untuk "Masuk dengan Google" di dashboard-kinerja (tabel employee_login_emails).
  email: string | null;
  emailKampus: string | null;
};

function cleanEmail(v: string | null | undefined): string | null {
  const e = v?.replace(ZERO_WIDTH_CHARS_RE, "").trim().toLowerCase();
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

// Karakter zero-width yang kadang nyelip di field "nama" Sevima (mis. U+200C sebelum
// nama), tidak dibuang oleh trim() biasa karena bukan whitespace — daftar eksplisit
// per-codepoint supaya tidak ada karakter tak-terlihat di source code ini sendiri.
const ZERO_WIDTH_CHARS_RE = /[\u200B\u200C\u200D\u200E\u200F\uFEFF]/g;

function sevimaBaseUrl(): string {
  return process.env.SEVIMA_API_URL || "https://api.sevimaplatform.com";
}

function sevimaHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-App-Key": process.env.SEVIMA_APP_KEY!,
    "X-Secret-Key": process.env.SEVIMA_SECRET_KEY!,
  };
}

// no_akun_finger datang sebagai string ("425") -- kosong/0/bukan angka dianggap tidak ada.
export function parseSevimaFingerId(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 2147483647 ? n : null;
}

async function fetchSevimaResource(resourcePath: string): Promise<SevimaEmployee[]> {
  let url: string | null = `${sevimaBaseUrl()}${resourcePath}`;

  const employees: SevimaEmployee[] = [];

  while (url) {
    const res: Response = await fetch(url, {
      method: "GET",
      headers: sevimaHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Sevima API (${resourcePath}) merespons ${res.status}`);
    }

    const body: SevimaListResponse = await res.json();

    for (const record of body.data ?? []) {
      const a = record.attributes ?? ({} as SevimaAttributes);
      const rawNip = cleanNip(a.nip);
      const nipPns = cleanNip(a.nip_pns);
      const nip = /^\d{18}$/.test(nipPns) ? nipPns : rawNip;
      const ids = [...new Set([rawNip, nipPns, cleanNip(a.nidn), cleanNip(a.nidk)].filter(Boolean))];
      const name = a.nama?.replace(ZERO_WIDTH_CHARS_RE, "").trim();
      // Dosen kontrak/LB dicek dari field "nip" asli Sevima (lib/nip.ts).
      if (nip && name && !isExcludedNip(rawNip)) {
        const statusId = (a.id_status_aktif ?? "").trim().toUpperCase();
        const statusText = (a.status_aktif ?? "").trim();
        // Status kosong dianggap aktif (jangan buang data hanya karena field tidak terisi).
        const active = statusId ? statusId === "AA" : !statusText || /^aktif$/i.test(statusText);
        employees.push({
          sevimaId: Number(a.id_pegawai ?? record.id),
          fingerId: parseSevimaFingerId(a.no_akun_finger),
          nip,
          ids,
          name,
          active,
          statusLabel: statusText || statusId || "Aktif",
          email: cleanEmail(record.attributes?.email),
          emailKampus: cleanEmail(record.attributes?.email_kampus),
        });
      }
    }

    url = body.urls?.next || null;
  }

  return employees;
}

export async function fetchSevimaEmployees(): Promise<SevimaEmployee[]> {
  const [pegawai, dosen] = await Promise.all([
    fetchSevimaResource("/siakadcloud/v1/pegawai"),
    fetchSevimaResource("/siakadcloud/v1/dosen"),
  ]);

  // Dedupe by NIP kalau-kalau ada orang yang muncul di kedua daftar (mis. dosen yang
  // juga tercatat sebagai pegawai struktural) — data /dosen menang kalau bentrok.
  const byNip = new Map<string, SevimaEmployee>();
  for (const emp of [...pegawai, ...dosen]) {
    // NIP yang sama di /pegawai dan /dosen: data /dosen menang, KECUALI yang lain aktif dan
    // data /dosen tidak aktif.
    const prev = byNip.get(emp.nip);
    if (prev && prev.active && !emp.active) continue;
    byNip.set(emp.nip, emp);
  }

  return [...byNip.values()];
}

// Log kehadiran harian satu pegawai dari aplikasi presensi Sevima:
// GET /siakadcloud/v1/presensi-pegawai/{id_pegawai}-{YYYY-MM-DD}. Satu record per hari
// (bukan per scan) -- jam_masuk/jam_keluar berupa jam lokal WITA "HH:MM:SS", kosong bila
// belum absen. Dipakai lib/sevima-presensi.ts untuk menggabungkan presensi aplikasi Sevima
// ke fingerprint_scans.
export type SevimaAttendanceDay = {
  fingerId: number | null;
  tanggal: string; // YYYY-MM-DD
  kodeAbsensi: string;
  jamMasuk: string | null; // "HH:MM:SS" WITA
  jamKeluar: string | null;
};

export type SevimaAttendanceFetch =
  | { ok: true; day: SevimaAttendanceDay | null } // null = tidak ada record hari itu
  | { ok: false; status: number };

type SevimaAttendanceAttributes = {
  no_akun_finger?: string | number | null;
  tanggal_presensi?: string | null;
  kode_absensi?: string | null;
  jam_masuk?: string | null;
  jam_keluar?: string | null;
};

function cleanClock(v: unknown): string | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || se > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}:${String(se).padStart(2, "0")}`;
}

export async function fetchSevimaAttendanceDay(sevimaId: number, date: string): Promise<SevimaAttendanceFetch> {
  const url = `${sevimaBaseUrl()}/siakadcloud/v1/presensi-pegawai/${sevimaId}-${date}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: sevimaHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (attempt === 0) continue;
      return { ok: false, status: 0 };
    }
    if (res.status === 404) return { ok: true, day: null };
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return { ok: false, status: res.status };
    }
    if (!res.ok) return { ok: false, status: res.status };

    // Bentuk record sama dengan endpoint lain ({id, attributes}), kadang dibungkus "data"
    // (objek atau array) -- terima semuanya, sama seperti lib/sevimaAuth.ts di dashboard-kinerja.
    type Rec = { attributes?: SevimaAttendanceAttributes };
    const raw = (await res.json().catch(() => null)) as (Rec & { data?: Rec | Rec[] }) | null;
    const wrapped = Array.isArray(raw?.data) ? raw?.data[0] : raw?.data;
    const a = raw?.attributes ?? wrapped?.attributes;
    if (!a) return { ok: true, day: null };
    return {
      ok: true,
      day: {
        fingerId: parseSevimaFingerId(a.no_akun_finger),
        tanggal: String(a.tanggal_presensi ?? date).slice(0, 10),
        kodeAbsensi: String(a.kode_absensi ?? "").trim(),
        jamMasuk: cleanClock(a.jam_masuk),
        jamKeluar: cleanClock(a.jam_keluar),
      },
    };
  }
  return { ok: false, status: 0 };
}
