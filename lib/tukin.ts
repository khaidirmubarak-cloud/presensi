import type { DailyStatusResult } from "./attendance-status";

export type DeductionTier = { max_minutes: number | null; percent: number };

// Dulu hardcode -- sekarang data-driven dari tabel tukin_deduction_tiers (Fase 6b) supaya
// bisa diedit admin lewat /admin/master/potongan-tukin, konsisten dengan aturan bisnis
// lain di aplikasi ini (jam kerja, jenis cuti, dst -- semua di database, bukan kode).
export function minutesToDeductionPercent(minutes: number | null, tiers: DeductionTier[]): number {
  if (!minutes || minutes <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => (a.max_minutes ?? Infinity) - (b.max_minutes ?? Infinity));
  for (const t of sorted) {
    if (t.max_minutes === null || minutes <= t.max_minutes) return t.percent;
  }
  return 0;
}

export type StudyAssignmentType = "tube1" | "tube2" | null;

export type DailyDeductionBreakdown = {
  telatPercent: number;
  pulangCepatPercent: number;
  alpaPercent: number;
  leavePercent: number;
  totalPercent: number;
};

const EMPTY_BREAKDOWN: DailyDeductionBreakdown = {
  telatPercent: 0,
  pulangCepatPercent: 0,
  alpaPercent: 0,
  leavePercent: 0,
  totalPercent: 0,
};

// Rincian potongan satu hari -- satu sumber kebenaran dipakai baik untuk total bulanan
// (computeMonthlyDeductionPercent) maupun halaman detail harian (Fase 6b).
export function computeDailyDeduction(
  day: DailyStatusResult,
  tiers: DeductionTier[],
  leaveDeductionPercentById: Map<string, number>,
  alpaDeductionPercent: number,
): DailyDeductionBreakdown {
  if (day.status === "libur" || day.status === "shift") return EMPTY_BREAKDOWN;

  if (day.status === "cuti") {
    const p = day.leaveTypeId ? (leaveDeductionPercentById.get(day.leaveTypeId) ?? 0) : 0;
    return { ...EMPTY_BREAKDOWN, leavePercent: p, totalPercent: p };
  }

  if (day.status === "belum_ada_data") {
    return { ...EMPTY_BREAKDOWN, alpaPercent: alpaDeductionPercent, totalPercent: alpaDeductionPercent };
  }

  // hadir | terlambat | pulang_cepat -- keduanya independen, dijumlah (bukan dipilih salah satu).
  const telatPercent = minutesToDeductionPercent(day.telatMenit, tiers);
  const pulangCepatPercent = minutesToDeductionPercent(day.pulangCepatMenit, tiers);
  return { telatPercent, pulangCepatPercent, alpaPercent: 0, leavePercent: 0, totalPercent: telatPercent + pulangCepatPercent };
}

// Menjumlahkan persentase potongan harian sebulan, lalu terapkan override (klinik/dokter
// dikecualikan total, tugas belajar override flat) sesuai keputusan kebijakan Fase 6.
export function computeMonthlyDeductionPercent(
  dailyStatuses: DailyStatusResult[],
  tiers: DeductionTier[],
  leaveDeductionPercentById: Map<string, number>,
  alpaDeductionPercent: number,
  isExempt: boolean,
  studyAssignmentType: StudyAssignmentType,
): number {
  if (isExempt) return 0;
  if (studyAssignmentType === "tube1") return 0;
  if (studyAssignmentType === "tube2") return 50;

  const total = dailyStatuses.reduce(
    (sum, day) => sum + computeDailyDeduction(day, tiers, leaveDeductionPercentById, alpaDeductionPercent).totalPercent,
    0,
  );

  return Math.min(total, 100);
}
