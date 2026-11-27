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

// --- Pembatas laju -------------------------------------------------------------------------
// API Sevima membalas 429 "Too many requests" bila dipanggil terlalu rapat (terjadi di produksi
// 2026-11-27 saat /pegawai & /dosen diambil paralel). Semua panggilan GET Sevima di modul ini
// lewat sevimaGet(): dijalankan BERURUTAN dengan jeda minimum, dan jeda itu otomatis
// diperlebar tiap kali kena 429 (lalu pelan-pelan dipersempit lagi saat lancar). Batas resmi
// Sevima tidak terdokumentasi, jadi jeda awal bisa diatur lewat SEVIMA_MIN_INTERVAL_MS.
const MAX_INTERVAL_MS = 5000;
let intervalMs = Math.max(0, Number(process.env.SEVIMA_MIN_INTERVAL_MS) || 300);
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

// GET dengan pembatas laju + coba ulang untuk 429/5xx/gangguan jaringan (maks 5 percobaan,
// menghormati header Retry-After). Mengembalikan Response terakhir (bisa tetap !ok), atau
// null bila jaringan gagal terus.
async function sevimaGet(url: string, timeoutMs = 30000): Promise<Response | null> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      last = await throttled(() =>
        fetch(url, { method: "GET", headers: sevimaHeaders(), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) }),
      );
    } catch {
      last = null;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (last.status === 429) {
      intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(500, intervalMs * 2));
      const retryAfter = Number(last.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    if (last.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (last.ok) intervalMs = Math.max(Number(process.env.SEVIMA_MIN_INTERVAL_MS) || 300, Math.floor(intervalMs * 0.9));
    return last;
  }
  return last;
}

async function fetchSevimaResource(resourcePath: string): Promise<SevimaEmployee[]> {
  let url: string | null = `${sevimaBaseUrl()}${resourcePath}`;

  const employees: SevimaEmployee[] = [];

  while (url) {
    const res = await sevimaGet(url);
    if (!res) throw new Error(`Sevima API (${resourcePath}) tidak dapat dihubungi`);

    if (!res.ok) {
      // Sertakan "detail" dari body error Sevima ({"errors":{"detail":...}}), mis. pesan whitelist IP.
      const errBody = (await res.json().catch(() => null)) as { errors?: { detail?: string } } | null;
      const detail = errBody?.errors?.detail ? `: ${errBody.errors.detail}` : "";
      throw new Error(`Sevima API (${resourcePath}) merespons ${res.status}${detail}`);
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
  const result = await fetchSevimaEmployeesFresh();
  employeeCache = { at: Date.now(), data: result };
  return result;
}

async function fetchSevimaEmployeesFresh(): Promise<SevimaEmployee[]> {
  // Berurutan, bukan paralel -- paralel memicu 429 dari Sevima.
  const pegawai = await fetchSevimaResource("/siakadcloud/v1/pegawai");
  const dosen = await fetchSevimaResource("/siakadcloud/v1/dosen");

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

// Versi bertembolok untuk penarikan presensi (tombol, pengakuan pegawai, cron): daftar pegawai
// Sevima (puluhan halaman) jarang berubah, jadi tidak perlu diambil ulang tiap kali tarik.
// "Sync dari Sevima" di menu Pegawai tetap memakai fetchSevimaEmployees() yang selalu baru,
// dan sekaligus memperbarui tembolok ini.
const EMPLOYEE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let employeeCache: { at: number; data: SevimaEmployee[] } | null = null;

export async function fetchSevimaEmployeesCached(): Promise<SevimaEmployee[]> {
  if (employeeCache && Date.now() - employeeCache.at < EMPLOYEE_CACHE_TTL_MS) return employeeCache.data;
  return fetchSevimaEmployees();
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
  | { ok: false; status: number; detail: string };

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
  const res = await sevimaGet(url, 20000);
  if (!res) return { ok: false, status: 0, detail: "tidak dapat terhubung ke Sevima" };
  if (res.status === 404) return { ok: true, day: null };
  if (!res.ok) {
    // Body error Sevima: {"errors":{"code":...,"detail":"..."}} -- ditampilkan ke admin supaya
    // penyebab (izin API key, format, batas laju) langsung terlihat.
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const j = JSON.parse(text) as { errors?: { detail?: string } | { detail?: string }[]; message?: string };
      const e = Array.isArray(j.errors) ? j.errors[0] : j.errors;
      detail = e?.detail || j.message || detail;
    } catch {
      // bukan JSON -- pakai potongan teks apa adanya
    }
    return { ok: false, status: res.status, detail };
  }

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
