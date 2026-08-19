// Migrasi sekali-jalan: tabel `gaji` (golongan x masa kerja -> nominal, ~428 baris) di
// cobakinerja jadi `salary_scales` di database baru. Dipakai untuk menghitung "potongan
// awal" dosen serdos di Tukin -- lihat lib/tukin.ts resolveSalaryScaleAmount().
//
// Tidak ada data per-pegawai yang dimigrasi di sini (`masa_kerja` cobakinerja) --
// employee_profiles.rank_id/service_years sudah lengkap sejak Fase 1, lookup dilakukan
// saat baca (derive, bukan disimpan ulang per pegawai).
//
// Aman dijalankan ulang: upsert by (rank_id, years).
//
// Jalankan: npm run migrate:gaji-pokok
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

async function main() {
  const source = await connectSource();
  const target = await connectTarget();

  try {
    console.log("Migrasi gaji pokok...");

    const [rows] = await source.query<any[]>("SELECT id_golongan, masa_kerja, nominal FROM gaji");

    const [rankRows] = await target.query<any[]>("SELECT id FROM ranks");
    const validRankIds = new Set((rankRows as any[]).map((r) => r.id));

    let migrated = 0;
    let skipped = 0;

    for (const r of rows as any[]) {
      if (!validRankIds.has(r.id_golongan)) {
        console.warn(`  lewati id_golongan=${r.id_golongan} masa_kerja=${r.masa_kerja}: golongan tidak ketemu di ranks`);
        skipped++;
        continue;
      }
      await target.execute(
        `INSERT INTO salary_scales (rank_id, years, nominal) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nominal = VALUES(nominal)`,
        [r.id_golongan, r.masa_kerja, r.nominal],
      );
      migrated++;
    }

    console.log(`  salary_scales: ${(rows as any[]).length} baris sumber, ${migrated} dimigrasikan, ${skipped} dilewati (golongan tidak ketemu)`);
    console.log("Migrasi gaji pokok selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
