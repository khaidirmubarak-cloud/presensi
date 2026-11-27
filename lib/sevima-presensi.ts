import { query, execute, toDbDatetime } from "./db";
import { fetchSevimaEmployeesCached, fetchSevimaAttendanceDay, type SevimaAttendanceDay } from "./sevima";

// Penggabungan presensi aplikasi Sevima ke presensi mesin fingerprint.
//
// Jam masuk/keluar dari Sevima ditulis sebagai baris biasa di fingerprint_scans dengan
// source = 'SEVIMA' -- tabel yang sama dengan scan mesin. Karena seluruh perhitungan
// (status presensi, tukin, uang makan, tampilan LKH) mengambil scan pertama = masuk dan scan
// terakhir = pulang dari tabel itu tanpa peduli asalnya, pegawai yang masuk lewat mesin lalu
// pulang lewat aplikasi Sevima (atau sebaliknya) otomatis jadi satu hari presensi yang utuh.
// Pencocokan pegawai lewat no_akun_finger Sevima = employees.finger_id (ID finger Sevima
// sama dengan ID di mesin, dikonfirmasi user 2026-11-27).
//
// Hanya pegawai yang presensi aplikasi Sevima-nya DIAKUI admin kepegawaian
// (employees.sevima_presensi_allowed = 1) yang ditarik -- kebijakan saat ini tidak berlaku untuk
// semua pegawai. Perhitungan juga menyaring hal yang sama (SCAN_EMPLOYEE_JOIN di lib/finger.ts),
// jadi mencabut izin langsung membuat scan Sevima yang sudah tersimpan tidak dihitung lagi.
//
// Aturan:
// - Jam Sevima adalah WITA -> dikurangi 8 jam sebelum disimpan (fingerprint_scans wajib UTC).
// - Aman dijalankan berulang: UNIQUE(finger_id, scanned_at) + INSERT IGNORE.
// - Jam Sevima yang berjarak <= NEAR_DUPLICATE_SECONDS dari scan non-Sevima (mesin) di
//   finger yang sama dilewati -- kalau Sevima ternyata juga mencatat scan mesin yang sama,
//   baris dobel beda beberapa detik bisa membuat 1 scan masuk terbaca "masuk + pulang".
// - Baris SEVIMA lama untuk finger+tanggal yang record Sevima-nya berhasil diambil tapi
//   jamnya sudah tidak ada lagi (dikoreksi di Sevima) dihapus, supaya ikut koreksi tsb.
//   Baris dari sumber lain (MESIN/MANUAL/...) tidak pernah disentuh.

export const SEVIMA_SOURCE = "SEVIMA";
const NEAR_DUPLICATE_SECONDS = 120;
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

export type SevimaPresensiSyncResult = {
  dryRun: boolean;
  dates: string[];
  pegawaiDicek: number; // pegawai yang benar-benar ditarik dari Sevima
  tidakDiakui: number; // pegawai dipilih yang presensi Sevima-nya tidak diakui admin -- dilewati
  tanpaFinger: number; // pegawai diakui tapi belum punya ID finger -- dilewati
  tidakDitemukanDiSevima: number; // pegawai diakui yang ID finger-nya tidak ada di data Sevima -- dilewati
  permintaan: number;
  gagal: number;
  gagalContoh: { sevimaId: number; date: string; status: number }[];
  recordAdaJam: number; // record Sevima yang punya jam masuk/keluar
  jamBaru: number; // baris SEVIMA baru (dryRun: yang AKAN ditambahkan)
  jamSudahAda: number;
  dilewatiDekatScanMesin: number;
  barisLamaDihapus: number;
  contoh: { name: string; fingerId: number; date: string; jamMasuk: string | null; jamKeluar: string | null; kode: string }[];
};

export function listDates(from: string, to: string): string[] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const dates: string[] = [];
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

export function todayWita(): string {
  return new Date(Date.now() + WITA_OFFSET_MS).toISOString().slice(0, 10);
}

function witaToUtcDb(date: string, clock: string): string {
  return toDbDatetime(new Date(Date.parse(`${date}T${clock}Z`) - WITA_OFFSET_MS));
}

function witaDateOfUtcDb(utc: string): string {
  return new Date(Date.parse(`${utc.replace(" ", "T")}Z`) + WITA_OFFSET_MS).toISOString().slice(0, 10);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function syncSevimaPresensi(
  dates: string[],
  // employeeIds: hanya pegawai ini (mis. yang dicentang admin); kosong = semua pegawai yang diakui.
  opts: { dryRun?: boolean; employeeIds?: string[] } = {},
): Promise<SevimaPresensiSyncResult> {
  const dryRun = !!opts.dryRun;
  const result: SevimaPresensiSyncResult = {
    dryRun,
    dates,
    pegawaiDicek: 0,
    tidakDiakui: 0,
    tanpaFinger: 0,
    tidakDitemukanDiSevima: 0,
    permintaan: 0,
    gagal: 0,
    gagalContoh: [],
    recordAdaJam: 0,
    jamBaru: 0,
    jamSudahAda: 0,
    dilewatiDekatScanMesin: 0,
    barisLamaDihapus: 0,
    contoh: [],
  };
  if (dates.length === 0) return result;

  type LocalRow = {
    id: string;
    name: string;
    finger_id: number | null;
    sevima_id: number | null;
    sevima_presensi_allowed: number;
  };
  const ids = opts.employeeIds && opts.employeeIds.length > 0 ? opts.employeeIds : null;
  const local = await query<LocalRow>(
    `SELECT id, name, finger_id, sevima_id, sevima_presensi_allowed FROM employees WHERE ${
      ids ? `id IN (${ids.map(() => "?").join(",")})` : "sevima_presensi_allowed = 1"
    }`,
    ids ?? [],
  );

  const candidates: LocalRow[] = [];
  for (const r of local) {
    if (Number(r.sevima_presensi_allowed) !== 1) result.tidakDiakui++;
    else if (r.finger_id === null) result.tanpaFinger++;
    else candidates.push(r);
  }

  // id_pegawai Sevima biasanya sudah tersimpan (diisi "Sync dari Sevima"). Hanya bila ada yang
  // belum, daftar pegawai Sevima diambil (bertembolok) untuk mencarinya lewat ID finger, lalu
  // disimpan supaya penarikan berikutnya tidak perlu mengambil daftar lagi.
  const missing = candidates.filter((c) => !c.sevima_id);
  if (missing.length > 0) {
    const sevimaIdByFinger = new Map<number, number>();
    for (const e of await fetchSevimaEmployeesCached()) {
      if (e.active && e.fingerId !== null && e.sevimaId > 0 && !sevimaIdByFinger.has(e.fingerId)) {
        sevimaIdByFinger.set(e.fingerId, e.sevimaId);
      }
    }
    for (const c of missing) {
      const sevimaId = sevimaIdByFinger.get(Number(c.finger_id));
      if (!sevimaId) continue;
      c.sevima_id = sevimaId;
      if (!dryRun) await execute("UPDATE employees SET sevima_id = ? WHERE id = ?", [sevimaId, c.id]);
    }
  }

  const targets: { sevimaId: number; fingerId: number; name: string }[] = [];
  for (const c of candidates) {
    if (c.sevima_id) targets.push({ sevimaId: Number(c.sevima_id), fingerId: Number(c.finger_id), name: c.name });
    else result.tidakDitemukanDiSevima++;
  }
  result.pegawaiDicek = targets.length;
  if (targets.length === 0) return result;

  // 1. Ambil record harian dari Sevima.
  const jobs = dates.flatMap((date) => targets.map((t) => ({ ...t, date })));
  const concurrency = Math.max(1, Math.min(16, Number(process.env.SEVIMA_CONCURRENCY) || 2));
  const fetched = await mapLimit(jobs, concurrency, async (job) => ({ job, res: await fetchSevimaAttendanceDay(job.sevimaId, job.date) }));
  result.permintaan = jobs.length;

  type Day = { fingerId: number; name: string; date: string; day: SevimaAttendanceDay };
  const days: Day[] = [];
  for (const { job, res } of fetched) {
    if (!res.ok) {
      result.gagal++;
      if (result.gagalContoh.length < 5) result.gagalContoh.push({ sevimaId: job.sevimaId, date: job.date, status: res.status });
      continue;
    }
    if (!res.day) continue;
    // Record milik finger lain (data Sevima tidak konsisten) -- jangan tulis ke finger yang salah.
    if (res.day.fingerId !== null && res.day.fingerId !== job.fingerId) continue;
    days.push({ fingerId: job.fingerId, name: job.name, date: job.date, day: res.day });
  }

  // 2. Scan yang sudah ada di rentang tanggal tsb, untuk deteksi dobel & koreksi.
  const fingers = [...new Set(days.map((d) => d.fingerId))];
  const existing = new Map<number, { id: number; scanned_at: string; source: string }[]>();
  if (fingers.length > 0) {
    const sorted = [...dates].sort();
    const rangeStart = witaToUtcDb(sorted[0], "00:00:00");
    const rangeEnd = toDbDatetime(new Date(Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`) + 24 * 3600 * 1000 - WITA_OFFSET_MS));
    const rows = await query<{ id: number; finger_id: number; scanned_at: string; source: string }>(
      `SELECT id, finger_id, scanned_at, source FROM fingerprint_scans
       WHERE finger_id IN (${fingers.map(() => "?").join(",")}) AND scanned_at >= ? AND scanned_at < ?`,
      [...fingers, rangeStart, rangeEnd],
    );
    for (const r of rows) {
      const list = existing.get(Number(r.finger_id)) ?? [];
      list.push({ id: Number(r.id), scanned_at: r.scanned_at, source: r.source });
      existing.set(Number(r.finger_id), list);
    }
  }

  // 3. Tulis jam baru, hapus baris SEVIMA yang sudah dikoreksi di Sevima.
  for (const d of days) {
    const clocks = [d.day.jamMasuk, d.day.jamKeluar].filter((c): c is string => !!c);
    if (clocks.length > 0) {
      result.recordAdaJam++;
      if (result.contoh.length < 10) {
        result.contoh.push({ name: d.name, fingerId: d.fingerId, date: d.date, jamMasuk: d.day.jamMasuk, jamKeluar: d.day.jamKeluar, kode: d.day.kodeAbsensi });
      }
    }
    const wanted = new Set(clocks.map((c) => witaToUtcDb(d.date, c)));
    const sameDay = (existing.get(d.fingerId) ?? []).filter((s) => witaDateOfUtcDb(s.scanned_at) === d.date);

    for (const utc of wanted) {
      if (sameDay.some((s) => s.scanned_at === utc)) {
        result.jamSudahAda++;
        continue;
      }
      const t = Date.parse(`${utc.replace(" ", "T")}Z`);
      const nearMachine = sameDay.some(
        (s) => s.source !== SEVIMA_SOURCE && Math.abs(Date.parse(`${s.scanned_at.replace(" ", "T")}Z`) - t) <= NEAR_DUPLICATE_SECONDS * 1000,
      );
      if (nearMachine) {
        result.dilewatiDekatScanMesin++;
        continue;
      }
      if (!dryRun) {
        const r = await execute("INSERT IGNORE INTO fingerprint_scans (finger_id, scanned_at, source) VALUES (?, ?, ?)", [
          d.fingerId,
          utc,
          SEVIMA_SOURCE,
        ]);
        if (r.affectedRows === 0) {
          result.jamSudahAda++;
          continue;
        }
      }
      result.jamBaru++;
    }

    const stale = sameDay.filter((s) => s.source === SEVIMA_SOURCE && !wanted.has(s.scanned_at));
    if (stale.length > 0) {
      if (!dryRun) {
        await execute(`DELETE FROM fingerprint_scans WHERE source = ? AND id IN (${stale.map(() => "?").join(",")})`, [
          SEVIMA_SOURCE,
          ...stale.map((s) => s.id),
        ]);
      }
      result.barisLamaDihapus += stale.length;
    }
  }

  return result;
}
