// Sama persis dengan dashboard-kinerja/lib/phone.ts -- format penyimpanan phone_number
// di employees (shared table) mengikuti normalisasi ini, jadi login di sini wajib pakai
// fungsi yang sama supaya nomor yang diketik user (mis. "0812...") cocok dengan yang
// tersimpan (mis. "6281234567890").
export function normalizePhoneNumber(input: string): string {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  return digits;
}
