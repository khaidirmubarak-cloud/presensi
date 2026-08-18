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
  | "belum_ada_data"
  | "hadir"
  | "terlambat"
  | "pulang_cepat";

export type DailyStatusResult = {
  status: AttendanceStatus;
  jamMasuk: string | null;
  jamPulang: string | null;
  telatMenit: number | null;
  pulangCepatMenit: number | null;
};

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
): DailyStatusResult {
  const asUtcDate = new Date(`${date}T00:00:00Z`);
  const empty: DailyStatusResult = {
    status: "libur",
    jamMasuk: null,
    jamPulang: null,
    telatMenit: null,
    pulangCepatMenit: null,
  };

  if (isWeekend(asUtcDate) || isHoliday(asUtcDate, holidayDates)) {
    return empty;
  }
  if (usesShift) {
    return { ...empty, status: "shift" };
  }

  const { jamMasuk, jamPulang } = deriveDailyAttendance(pings);
  if (!jamMasuk) {
    return { ...empty, status: "belum_ada_data" };
  }

  const dayType = asUtcDate.getUTCDay() === 5 ? "friday" : "weekday";
  const periodType = isRamadhan(date, ramadhanPeriods) ? "ramadhan" : "normal";
  const rule = rules.find((r) => r.day_type === dayType && r.period_type === periodType);

  if (!rule) {
    return { status: "hadir", jamMasuk, jamPulang, telatMenit: null, pulangCepatMenit: null };
  }

  const masukMenit = toMinutes(witaTimeOfDay(jamMasuk));
  const telatMenit = Math.max(0, masukMenit - toMinutes(rule.check_in_time));

  let pulangCepatMenit: number | null = null;
  if (jamPulang) {
    const pulangMenit = toMinutes(witaTimeOfDay(jamPulang));
    pulangCepatMenit = Math.max(0, toMinutes(rule.check_out_time) - pulangMenit);
  }

  let status: AttendanceStatus = "hadir";
  if (telatMenit > 0) status = "terlambat";
  else if (pulangCepatMenit && pulangCepatMenit > 0) status = "pulang_cepat";

  return {
    status,
    jamMasuk,
    jamPulang,
    telatMenit,
    pulangCepatMenit,
  };
}
