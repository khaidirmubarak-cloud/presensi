import type { DailyStatusResult } from "./attendance-status";

// cobakinerja: hari dihitung "hadir" untuk uang makan kalau keterangan HS/HT (hadir, apa
// pun keterlambatannya) atau jenis cuti/izin tertentu yang ditandai
// counts_toward_meal_allowance (mis. SP/EA) -- lihat README.
export function isEligibleMealDay(day: DailyStatusResult, mealLeaveTypeIds: Set<string>): boolean {
  if (day.status === "hadir" || day.status === "terlambat" || day.status === "pulang_cepat") return true;
  if (day.status === "cuti" && day.leaveTypeId) return mealLeaveTypeIds.has(day.leaveTypeId);
  return false;
}
