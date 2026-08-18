// Migrasi sekali-jalan: tabel `libur`/`ramadhan`/`harikerja` di database cobakinerja ->
// holidays/ramadhan_periods/historical_work_day_counts di database MariaDB yang dipakai
// bersama dashboard-kinerja/kinerja (Fase 2: Hari Libur & Kalender Kerja).
//
// Aman dijalankan ulang (idempotent): holidays pakai INSERT IGNORE by legacy_id_libur,
// ramadhan_periods & historical_work_day_counts pakai upsert by primary key.
//
// harikerja dimigrasikan APA ADANYA ke historical_work_day_counts sebagai arsip saja --
// aplikasi baru tidak memakainya sebagai sumber kebenaran lagi, lihat lib/calendar.ts dan
// catatan di sql/002_calendar.sql.
//
// Jalankan: npm run migrate:calendar
// Env yang dibutuhkan (sama seperti migrate:cobakinerja, lihat .env):
//   SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

import mysql from "mysql2/promise";

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

async function migrateHolidays(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>(
    "SELECT id_libur, tanggal, keterangan FROM libur ORDER BY tanggal",
  );
  let inserted = 0;
  for (const r of rows as any[]) {
    const [result] = await target.execute<mysql.ResultSetHeader>(
      "INSERT IGNORE INTO holidays (legacy_id_libur, holiday_date, description) VALUES (?, ?, ?)",
      [r.id_libur, r.tanggal, r.keterangan],
    );
    if (result.affectedRows > 0) inserted++;
  }
  console.log(`  holidays: ${(rows as any[]).length} baris sumber, ${inserted} baru dimasukkan`);
}

async function migrateRamadhan(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>(
    "SELECT tahun, tglmulai, tglselesai FROM ramadhan ORDER BY tahun",
  );
  for (const r of rows as any[]) {
    await target.execute(
      `INSERT INTO ramadhan_periods (year, start_date, end_date) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE start_date = VALUES(start_date), end_date = VALUES(end_date)`,
      [r.tahun, r.tglmulai, r.tglselesai],
    );
  }
  console.log(`  ramadhan_periods: ${(rows as any[]).length} baris`);
}

async function migrateHistoricalWorkDayCounts(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>(
    "SELECT periode, jumlah FROM harikerja ORDER BY periode",
  );
  for (const r of rows as any[]) {
    await target.execute(
      `INSERT INTO historical_work_day_counts (period, day_count) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE day_count = VALUES(day_count)`,
      [r.periode, r.jumlah],
    );
  }
  console.log(`  historical_work_day_counts: ${(rows as any[]).length} baris`);
}

async function main() {
  const source = await connectSource();
  const target = await connectTarget();

  try {
    console.log("Migrasi kalender (libur, ramadhan, harikerja)...");
    await migrateHolidays(source, target);
    await migrateRamadhan(source, target);
    await migrateHistoricalWorkDayCounts(source, target);
    console.log("Migrasi kalender selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
