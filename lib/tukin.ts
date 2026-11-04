import type { DailyStatusResult } from "./attendance-status";

export type DeductionTier = { max_minutes: number | null; percent: number };

// Dulu hardcode -- sekarang data-driven dari tabel tukin_deduction_tiers (Fase 6b) supaya
// bisa diedit admin lewat /admin/master/potongan-tukin, konsisten dengan aturan bisnis
// lain di aplikasi ini (jam kerja, jenis cuti, dst -- semua di database, bukan kode).
export function sortTiers(tiers: DeductionTier[]): DeductionTier[] {
  return [...tiers].sort((a, b) => (a.max_minutes ?? Infinity) - (b.max_minutes ?? Infinity));
}

// Indeks tier (dalam urutan sortTiers) untuk sekian menit, -1 kalau tidak kena potongan.
// Infinity = tidak presensi masuk/pulang -> selalu tier tertinggi (aturan kepegawaian:
// dihitung kategori > 90 menit), walau tier tertinggi di master punya batas max_minutes.
export function tierIndex(minutes: number | null, tiers: DeductionTier[]): number {
  if (!minutes || minutes <= 0) return -1;
  const sorted = sortTiers(tiers);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].max_minutes === null || minutes <= sorted[i].max_minutes!) return i;
  }
  return minutes === Infinity ? sorted.length - 1 : -1;
}

export function minutesToDeductionPercent(minutes: number | null, tiers: DeductionTier[]): number {
  const i = tierIndex(minutes, tiers);
  return i < 0 ? 0 : sortTiers(tiers)[i].percent;
}

// Menit yang dipakai untuk potongan -- tidak presensi masuk/pulang diperlakukan tak hingga.
export function effectiveTelatMinutes(day: DailyStatusResult): number | null {
  return day.tidakPresensiMasuk ? Infinity : day.telatMenit;
}

export function effectivePulangCepatMinutes(day: DailyStatusResult): number | null {
  return day.tidakPresensiPulang ? Infinity : day.pulangCepatMenit;
}

export type SalaryScale = { rank_id: string; years: number; nominal: number };

// Basis "potongan awal" untuk dosen serdos (cetak/laptukin.php cobakinerja): gaji pokok
// pegawai dari golongan + masa kerja golongan. Exact match dulu, kalau tidak ada pakai
// baris `years` tertinggi yang <= masa kerja pegawai untuk golongan itu (fallback pegawai
// senior di luar rentang tabel) -- null kalau golongan itu sama sekali tidak ada di tabel.
export function resolveSalaryScaleAmount(
  rankId: string | null,
  serviceYears: number | null,
  scales: SalaryScale[],
): number | null {
  if (!rankId || serviceYears === null) return null;
  const forRank = scales.filter((s) => s.rank_id === rankId);
  if (forRank.length === 0) return null;

  const exact = forRank.find((s) => s.years === serviceYears);
  if (exact) return exact.nominal;

  const below = forRank.filter((s) => s.years <= serviceYears).sort((a, b) => b.years - a.years);
  return below[0]?.nominal ?? null;
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
  const telatPercent = minutesToDeductionPercent(effectiveTelatMinutes(day), tiers);
  const pulangCepatPercent = minutesToDeductionPercent(effectivePulangCepatMinutes(day), tiers);
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
