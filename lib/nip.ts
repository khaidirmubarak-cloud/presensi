// Pembersih NIP bersama. NIP/NIDN/kode pegawai hanya berisi huruf dan angka -- apa pun selain
// itu (spasi, titik, tanda hubung, karakter tak terlihat seperti U+200C, atau sisa encoding
// rusak seperti "â€Œ" dari data cobakinerja) dibuang. Pernah menyebabkan pegawai dobel:
// "â€Œ198706032025212019" (cobakinerja) tidak dikenali sama dengan "198706032025212019"
// (Sevima), sehingga sync Sevima membuat baris baru.

export function cleanNip(v: unknown): string {
  return String(v ?? "").replace(/[^0-9A-Za-z]/g, "");
}

// Padanan cleanNip untuk dipakai di SQL (MariaDB 10.0.5+), dibandingkan tanpa beda huruf besar/kecil.
export function cleanNipSql(column: string): string {
  return `LOWER(REGEXP_REPLACE(COALESCE(${column}, ''), '[^0-9A-Za-z]', ''))`;
}
