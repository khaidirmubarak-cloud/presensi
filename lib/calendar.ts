// Hari kerja = Senin-Jumat dikurangi tanggal yang ada di `holidays` -- persis aturan yang
// dipakai config/hitung.php di cobakinerja (akhir pekan dicek via date('w'), bukan data
// tersimpan). Dihitung otomatis di sini, bukan diketik manual seperti `harikerja` lama
// (lihat sql/002_calendar.sql untuk alasan lengkap).

// Index cocok dengan Date.getUTCDay() (0 = Minggu).
export const DAY_NAMES_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isHoliday(date: Date, holidayDates: Set<string>): boolean {
  return holidayDates.has(toDateKey(date));
}

export function isWorkingDay(date: Date, holidayDates: Set<string>): boolean {
  return !isWeekend(date) && !isHoliday(date, holidayDates);
}

export function countWorkingDays(start: Date, end: Date, holidayDates: Set<string>): number {
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endKey = toDateKey(end);
  while (toDateKey(cursor) <= endKey) {
    if (isWorkingDay(cursor, holidayDates)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
