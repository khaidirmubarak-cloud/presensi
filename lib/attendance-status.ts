import { APP_TIMEZONE } from "./timezone";
import { isWeekend, isHoliday } from "./calendar";

// deriveDailyAttendance() diduplikasi apa adanya dari dashboard-kinerja/lib/attendance.ts
// (pola sama seperti lib/phone.ts di Fase 1 -- file kecil, disalin, bukan dependency
// lintas-repo). computeDailyStatus() di bawah ini genuinely baru: membandingkan jam
// masuk/pulang hasil derive itu terhadap work_hour_rules (Fase 3), yang belum ada di
// dashboard-kinerja (self-service saja, tidak menghitung status).

export type AttendancePing = {
  created_at: string; // ISO UTC
  within_radius: number; // 0 | 1
};

// Fase 3b: satu baris scan mesin fingerprint (fingerprint_scans), jam masuk/pulang lebih
// bisa diandalkan daripada WA-ping (radius GPS, adopsi rendah) -- lihat computeDailyStatus.
export type FingerprintScan = {
  scanned_at: string; // ISO UTC
};

export type DailyAttendance = {
  jamMasuk: string | null; // ISO timestamp ping valid pertama
  jamPulang: string | null; // ISO timestamp ping valid terakhir, null kalau cuma 1 ping valid
};

export function deriveDailyAttendance(pings: AttendancePing[]): DailyAttendance {
  const sorted = [...pings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const valid = sorted.filter((p) => p.within_radius === 1);
  return {
    jamMasuk: valid[0]?.created_at ?? null,
    jamPulang: valid.length >= 2 ? valid[valid.length - 1].created_at : null,
  };
}

// Semua scan fingerprint dianggap valid (tidak ada konsep radius seperti WA-ping) --
// scan pertama hari itu = masuk, scan terakhir = pulang (null kalau cuma 1 scan).
export function deriveDailyAttendanceFromScans(scans: FingerprintScan[]): DailyAttendance {
  const sorted = [...scans].sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
  return {
    jamMasuk: sorted[0]?.scanned_at ?? null,
    jamPulang: sorted.length >= 2 ? sorted[sorted.length - 1].scanned_at : null,
  };
}

export type WorkHourRule = {
  day_type: "weekday" | "friday";
  period_type: "normal" | "ramadhan";
  check_in_time: string; // 'HH:MM:SS'
  check_out_time: string;
};

export type RamadhanRange = { start_date: string; end_date: string }; // 'YYYY-MM-DD'

export type AttendanceStatus =
  | "libur"
  | "shift"
  | "cuti"
  | "belum_ada_data"
  | "hadir"
  | "terlambat"
  | "pulang_cepat";

export type AttendanceSource = "fingerprint" | "wa_ping" | null;

// Label Indonesia dipakai bareng oleh UI (app/admin/presensi/page.tsx) dan export PDF/Excel
// (lib/presensi-export.ts) -- satu sumber supaya tidak ada dua daftar label yang bisa
// berbeda diam-diam.
export const STATUS_LABEL_ID: Record<AttendanceStatus, string> = {
  libur: "Libur",
  shift: "Shift",
  cuti: "Cuti",
  belum_ada_data: "Belum Ada Data",
  hadir: "Hadir",
  terlambat: "Terlambat",
  pulang_cepat: "Pulang Cepat",
};

export type DailyStatusResult = {
  status: AttendanceStatus;
  jamMasuk: string | null;
  jamPulang: string | null;
  telatMenit: number | null;
  pulangCepatMenit: number | null;
  sumber: AttendanceSource;
  leaveTypeName: string | null;
  leaveTypeId: string | null;
  // Hanya ada satu scan/ping hari itu -- aturan kepegawaian: dihitung potongan kategori
  // tertinggi (>90 menit) untuk sisi yang tidak presensi (lihat lib/tukin.ts). Sama hasilnya
  // dengan cobakinerja (config/hitung.php), yang memakai MIN/MAX scan sebagai datang/pulang
  // sehingga satu scan pagi otomatis jadi "pulang cepat" > 90 menit.
  tidakPresensiMasuk: boolean;
  tidakPresensiPulang: boolean;
};

// Tanggal hari ini (WITA) dalam format 'YYYY-MM-DD'.
export function todayWita(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
}

function witaTimeOfDay(isoDatetime: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(isoDatetime));
}

function toMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

function isRamadhan(date: string, ramadhanPeriods: RamadhanRange[]): boolean {
  return ramadhanPeriods.some((r) => date >= r.start_date && date <= r.end_date);
}

export function computeDailyStatus(
  date: string, // 'YYYY-MM-DD'
  pings: AttendancePing[],
  usesShift: boolean,
  holidayDates: Set<string>,
  ramadhanPeriods: RamadhanRange[],
  rules: WorkHourRule[],
  fingerprintScans: FingerprintScan[] = [],
  approvedLeave: { id: string; name: string } | null = null,
  today: string = todayWita(), // 'YYYY-MM-DD' WITA -- parameter supaya bisa diuji
): DailyStatusResult {
  const asUtcDate = new Date(`${date}T00:00:00Z`);
  const empty: DailyStatusResult = {
    status: "libur",
    jamMasuk: null,
    jamPulang: null,
    telatMenit: null,
    pulangCepatMenit: null,
    sumber: null,
    leaveTypeName: null,
    leaveTypeId: null,
    tidakPresensiMasuk: false,
    tidakPresensiPulang: false,
  };

  if (isWeekend(asUtcDate) || isHoliday(asUtcDate, holidayDates)) {
    return empty;
  }
  // Fase 4: cuti/izin disetujui menang atas shift/ping/fingerprint -- sama seperti
  // ijin_detail override keterangan sebelum logika hadir/telat di hitung.php (cobakinerja).
  if (approvedLeave) {
    return { ...empty, status: "cuti", leaveTypeName: approvedLeave.name, leaveTypeId: approvedLeave.id };
  }
  if (usesShift) {
    return { ...empty, status: "shift" };
  }

  // Fingerprint = sumber utama (keputusan awal arsitektur), WA-ping cuma pelengkap kalau
  // hari itu tidak ada scan mesin sama sekali.
  const fromFingerprint = deriveDailyAttendanceFromScans(fingerprintScans);
  const sumber: AttendanceSource = fromFingerprint.jamMasuk ? "fingerprint" : pings.length > 0 ? "wa_ping" : null;
  const { jamMasuk, jamPulang } = fromFingerprint.jamMasuk ? fromFingerprint : deriveDailyAttendance(pings);
  if (!jamMasuk) {
    return { ...empty, status: "belum_ada_data" };
  }

  const dayType = asUtcDate.getUTCDay() === 5 ? "friday" : "weekday";
  const periodType = isRamadhan(date, ramadhanPeriods) ? "ramadhan" : "normal";
  const rule = rules.find((r) => r.day_type === dayType && r.period_type === periodType);

  if (!rule) {
    return {
      status: "hadir",
      jamMasuk,
      jamPulang,
      telatMenit: null,
      pulangCepatMenit: null,
      sumber,
      leaveTypeName: null,
      leaveTypeId: null,
      tidakPresensiMasuk: false,
      tidakPresensiPulang: false,
    };
  }

  const checkInMenit = toMinutes(rule.check_in_time);
  const checkOutMenit = toMinutes(rule.check_out_time);

  // Cuma satu scan/ping: tentukan itu presensi masuk atau pulang dari posisinya terhadap titik
  // tengah jam kerja. Sebelum tengah = masuk (tidak presensi pulang); sesudahnya = pulang
  // (tidak presensi masuk).
  let masuk: string | null = jamMasuk;
  let pulang: string | null = jamPulang;
  let tidakPresensiMasuk = false;
  let tidakPresensiPulang = false;
  if (!pulang) {
    const scanMenit = toMinutes(witaTimeOfDay(jamMasuk));
    if (scanMenit >= (checkInMenit + checkOutMenit) / 2) {
      pulang = jamMasuk;
      masuk = null;
      tidakPresensiMasuk = true;
    } else if (date < today) {
      // Hari ini belum dihitung -- pegawai yang baru presensi masuk belum tentu lupa pulang.
      tidakPresensiPulang = true;
    }
  }

  const telatMenit = masuk ? Math.max(0, toMinutes(witaTimeOfDay(masuk)) - checkInMenit) : null;
  const pulangCepatMenit = pulang ? Math.max(0, checkOutMenit - toMinutes(witaTimeOfDay(pulang))) : null;

  let status: AttendanceStatus = "hadir";
  if (tidakPresensiMasuk || (telatMenit !== null && telatMenit > 0)) status = "terlambat";
  else if (tidakPresensiPulang || (pulangCepatMenit !== null && pulangCepatMenit > 0)) status = "pulang_cepat";

  return {
    status,
    jamMasuk: masuk,
    jamPulang: pulang,
    telatMenit,
    pulangCepatMenit,
    sumber,
    leaveTypeName: null,
    leaveTypeId: null,
    tidakPresensiMasuk,
    tidakPresensiPulang,
  };
}
