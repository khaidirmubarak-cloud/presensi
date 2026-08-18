// Migrasi historis sekali-jalan: tabel `absen` (cobakinerja, ~1,2 juta baris scan mesin
// fingerprint 2019-2026) -> fingerprint_scans di database MariaDB yang dipakai bersama
// dashboard-kinerja/kinerja (Fase 3b).
//
// Beda dari migrate-from-cobakinerja.ts/migrate-calendar-from-cobakinerja.ts (baris demi
// baris, cukup untuk ratusan baris) -- skrip ini dipecah per bulan (pakai index `tanggal`
// yang sudah ada di `absen`, bukan LIMIT/OFFSET yang O(n^2) untuk data sebesar ini) lalu
// insert per-batch multi-row.
//
// Data quality (ditemukan lewat analisis langsung isi dump, bukan asumsi):
// - 30 baris tanggal='0000-00-00 00:00:00' (placeholder) -> dilewati.
// - ~1.996 baris sampah: persis 1 baris per tahun dari 2027 sampai 4022 (pola khas jam
//   device salah-set) -- data asli sungguhan berhenti di 2026. Baris YEAR(tanggal) > 2026
//   dilewati.
//
// Aman dijalankan ulang: INSERT IGNORE + UNIQUE(finger_id, scanned_at) di tabel target.
//
// Jalankan: npm run migrate:fingerprint
// Env yang dibutuhkan (sama seperti migrate:cobakinerja): SOURCE_DB_*, DB_*

import mysql from "mysql2/promise";

const BATCH_SIZE = 2000;
const LAST_VALID_YEAR = 2026;
const FIRST_YEAR = 2019;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ${name} wajib diisi.`);
  return v;
}

async function connectSource() {
  return mysql.createConnection({
    host: requireEnv("SOURCE_DB_HOST"),
    port: Number(process.env.SOURCE_DB_PORT || 3306),
    user: requireEnv("SOURCE_DB_USER"),
    password: process.env.SOURCE_DB_PASSWORD || "",
    database: process.env.SOURCE_DB_NAME || "cobakinerja",
    dateStrings: true,
  });
}

async function connectTarget() {
  return mysql.createConnection({
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: requireEnv("DB_USER"),
    password: process.env.DB_PASSWORD || "",
    dateStrings: true,
    database: requireEnv("DB_NAME"),
  });
}

type AbsenRow = {
  id_pegawai: number;
  id_finger: number;
  tanggal: string;
  status: string;
};

// cobakinerja tidak disiplin UTC seperti app ini (lib/db.ts) -- jam mesin fingerprint
// dicatat sebagai waktu LOKAL WITA apa adanya (bukan UTC). Tanpa konversi ini, setiap scan
// yang dimigrasikan bakal geser 8 jam saat dibaca ulang sebagai UTC (dbDatetimeToIso).
// WITA = UTC+8 tetap sepanjang tahun (Indonesia tidak pakai DST), aman di-hardcode.
function witaToUtcDbDatetime(witaLocal: string): string {
  const utc = new Date(`${witaLocal.replace(" ", "T")}+08:00`);
  return utc.toISOString().slice(0, 19).replace("T", " ");
}

async function insertBatch(target: mysql.Connection, rows: AbsenRow[]) {
  if (rows.length === 0) return 0;
  const placeholders = rows.map(() => "(?, ?, ?, ?)").join(", ");
  const params: any[] = [];
  for (const r of rows) {
    params.push(r.id_finger, witaToUtcDbDatetime(r.tanggal), r.status, r.id_pegawai);
  }
  const [result] = await target.execute<mysql.ResultSetHeader>(
    `INSERT IGNORE INTO fingerprint_scans (finger_id, scanned_at, source, legacy_id_pegawai)
     VALUES ${placeholders}`,
    params,
  );
  return result.affectedRows;
}

async function main() {
  const source = await connectSource();
  const target = await connectTarget();

  try {
    let totalSource = 0;
    let totalInserted = 0;

    for (let year = FIRST_YEAR; year <= LAST_VALID_YEAR; year++) {
      for (let month = 1; month <= 12; month++) {
        const start = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
        const nextMonth = month === 12 ? `${year + 1}-01-01 00:00:00` : `${year}-${String(month + 1).padStart(2, "0")}-01 00:00:00`;

        const [rows] = await source.query<any[]>(
          `SELECT id_pegawai, id_finger, tanggal, status FROM absen
           WHERE tanggal >= ? AND tanggal < ? ORDER BY tanggal`,
          [start, nextMonth],
        );
        if (rows.length === 0) continue;

        totalSource += rows.length;
        let insertedThisMonth = 0;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE) as AbsenRow[];
          insertedThisMonth += await insertBatch(target, batch);
        }
        totalInserted += insertedThisMonth;
        console.log(`  ${year}-${String(month).padStart(2, "0")}: ${rows.length} baris sumber, ${insertedThisMonth} baru dimasukkan`);
      }
    }

    console.log(`Migrasi fingerprint selesai. Total sumber diproses: ${totalSource}, baru dimasukkan: ${totalInserted}.`);
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
