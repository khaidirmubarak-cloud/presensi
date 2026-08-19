import type { DailyStatusResult } from "./attendance-status";

// Satu-satunya bagian formula tukin cobakinerja yang konsisten di ketiga implementasi
// legacy yang saling beda (lihat README) -- tier keterlambatan/pulang cepat.
export function minutesToDeductionPercent(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 0;
  if (minutes <= 30) return 0.5;
  if (minutes <= 60) return 1;
  if (minutes <= 90) return 1.25;
  return 1.5;
}

export type StudyAssignmentType = "tube1" | "tube2" | null;

// Menjumlahkan persentase potongan harian sebulan, lalu terapkan override (klinik/dokter
// dikecualikan total, tugas belajar override flat) sesuai keputusan kebijakan Fase 6.
export function computeMonthlyDeductionPercent(
  dailyStatuses: DailyStatusResult[],
  leaveDeductionPercentById: Map<string, number>,
  alpaDeductionPercent: number,
  isExempt: boolean,
  studyAssignmentType: StudyAssignmentType,
): number {
  if (isExempt) return 0;
  if (studyAssignmentType === "tube1") return 0;
  if (studyAssignmentType === "tube2") return 50;

  let total = 0;
  for (const day of dailyStatuses) {
    if (day.status === "libur" || day.status === "shift") continue;
    if (day.status === "cuti") {
      total += day.leaveTypeId ? (leaveDeductionPercentById.get(day.leaveTypeId) ?? 0) : 0;
      continue;
    }
    if (day.status === "belum_ada_data") {
      total += alpaDeductionPercent;
      continue;
    }
    // hadir | terlambat | pulang_cepat -- keduanya independen, dijumlah (bukan dipilih salah satu).
    total += minutesToDeductionPercent(day.telatMenit) + minutesToDeductionPercent(day.pulangCepatMenit);
  }

  return Math.min(total, 100);
}
