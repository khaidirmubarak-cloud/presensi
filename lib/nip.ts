// Pembersih NIP bersama. NIP/NIDN/kode pegawai hanya berisi huruf dan angka -- apa pun selain
// itu (spasi, titik, tanda hubung, karakter tak terlihat seperti U+200C, atau sisa encoding
// rusak seperti "â€Œ" dari data cobakinerja) dibuang. Pernah menyebabkan pegawai dobel:
// "â€Œ198706032025212019" (cobakinerja) tidak dikenali sama dengan "198706032025212019"
// (Sevima), sehingga sync Sevima membuat baris baru.

export function cleanNip(v: unknown): string {
  return String(v ?? "").replace(/[^0-9A-Za-z]/g, "");
}

// Dosen kontrak / luar biasa (NIP Sevima berawalan "LB", mis. LB0123) tidak termasuk pegawai
// yang dikelola sistem ini -- tidak diperhitungkan di presensi, tunjangan kinerja, maupun uang
// makan, dan tidak memakai LKH. Tidak diimpor dari Sevima (lib/sevima.ts); baris lama
// dibersihkan dengan `npm run fix:hapus-dosen-lb`.
export const EXCLUDED_NIP_PREFIXES = ["LB"];

export function isExcludedNip(nip: unknown): boolean {
  const clean = cleanNip(nip).toUpperCase();
  return EXCLUDED_NIP_PREFIXES.some((p) => clean.startsWith(p));
}

// Padanan cleanNip untuk dipakai di SQL (MariaDB 10.0.5+), dibandingkan tanpa beda huruf besar/kecil.
export function cleanNipSql(column: string): string {
  return `LOWER(REGEXP_REPLACE(COALESCE(${column}, ''), '[^0-9A-Za-z]', ''))`;
}

// Pembersih nama pegawai: buang karakter tak terlihat (U+200B–U+200D, U+FEFF) beserta sisa
// encoding rusaknya ("â€Œ", "â€‹") yang terbawa dari cobakinerja, rapikan spasi ganda, dan
// buang spasi di awal/akhir (mis. " Inal, S.Pd.,M.Pd.").
export function cleanName(v: unknown): string {
  return String(v ?? "")
    .replace(/â€Œ|â€‹|[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
