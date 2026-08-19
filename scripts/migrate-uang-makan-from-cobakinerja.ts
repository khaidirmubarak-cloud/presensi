// Migrasi sekali-jalan (Fase 7: Uang Makan):
// - golongan.um / golongan.pajak -> ranks.meal_amount / ranks.meal_tax_percent
// - leave_types.counts_toward_meal_allowance = 1 untuk SP (Surat Pernyataan Tanggung
//   Jawab Mutlak) dan EA (Absen Pusaka) -- dua jenis cuti/izin yang tetap dihitung hadir
//   untuk uang makan di cobakinerja.
//
// Tidak ada data per-pegawai yang perlu dimigrasi -- employee_profiles.gets_meal_allowance
// dan rank_id sudah lengkap sejak migrasi Fase 1.
//
// Aman dijalankan ulang: semuanya UPDATE by id/kode.
//
// Jalankan: npm run migrate:uang-makan
// Env yang dibutuhkan (sama seperti migrate:cobakinerja): SOURCE_DB_*, DB_*

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

async function migrateRankMealRates(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>("SELECT id_golongan, um, pajak FROM golongan");
  let updated = 0;
  for (const r of rows as any[]) {
    const [result] = await target.execute<mysql.ResultSetHeader>(
      "UPDATE ranks SET meal_amount = ?, meal_tax_percent = ? WHERE id = ?",
      [r.um, r.pajak, r.id_golongan],
    );
    if (result.affectedRows > 0) updated++;
  }
  console.log(`  ranks.meal_amount/meal_tax_percent: ${(rows as any[]).length} baris sumber, ${updated} ter-update`);
}

async function markMealEligibleLeaveTypes(target: mysql.Connection) {
  const [result] = await target.execute<mysql.ResultSetHeader>(
    "UPDATE leave_types SET counts_toward_meal_allowance = 1 WHERE id IN ('SP', 'EA')",
  );
  console.log(`  leave_types.counts_toward_meal_allowance: ${result.affectedRows} baris ditandai (SP, EA)`);
}

async function main() {
  const source = await connectSource();
  const target = await connectTarget();

  try {
    console.log("Migrasi uang makan (nominal golongan, jenis cuti eligible)...");
    await migrateRankMealRates(source, target);
    await markMealEligibleLeaveTypes(target);
    console.log("Migrasi uang makan selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
