// Migrasi sekali-jalan (Fase 6: Tukin):
// - kelas.tukin -> job_classes.base_amount
// - tukin_nonpns.tukin -> tukin_nonpns_grades.base_amount
// - h_tube -> study_assignments
//
// Tidak memigrasi tabel `tukin` (histori lama) -- rumus lama tidak konsisten (tiga
// implementasi paralel berbeda hasil), sistem baru mulai dari nol dengan rumus baru.
//
// Aman dijalankan ulang: nominal di-UPDATE by id, study_assignments upsert by
// legacy_id_tube.
//
// Jalankan: npm run migrate:tukin
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

function mapTubeType(jenisTube: string): "tube1" | "tube2" | null {
  const v = jenisTube.trim().toLowerCase();
  if (v === "tube1") return "tube1";
  if (v === "tube2") return "tube2";
  return null;
}

function mapTubeStatus(statusTube: string): "aktif" | "selesai" {
  return statusTube === "Y" ? "aktif" : "selesai";
}

async function migrateJobClassAmounts(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>("SELECT id_kelas, tukin FROM kelas");
  let updated = 0;
  for (const r of rows as any[]) {
    const [result] = await target.execute<mysql.ResultSetHeader>("UPDATE job_classes SET base_amount = ? WHERE id = ?", [
      r.tukin,
      r.id_kelas,
    ]);
    if (result.affectedRows > 0) updated++;
  }
  console.log(`  job_classes.base_amount: ${(rows as any[]).length} baris sumber, ${updated} ter-update`);
}

async function migrateNonpnsGradeAmounts(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>("SELECT grade_tukin, tukin FROM tukin_nonpns");
  let updated = 0;
  for (const r of rows as any[]) {
    const [result] = await target.execute<mysql.ResultSetHeader>(
      "UPDATE tukin_nonpns_grades SET base_amount = ? WHERE id = ?",
      [r.tukin, r.grade_tukin],
    );
    if (result.affectedRows > 0) updated++;
  }
  console.log(`  tukin_nonpns_grades.base_amount: ${(rows as any[]).length} baris sumber, ${updated} ter-update`);
}

async function migrateStudyAssignments(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>(
    "SELECT id_tube, id_user, jenis_tube, status_tube, tgl_tube FROM h_tube ORDER BY id_tube",
  );

  const [empRows] = await target.query<any[]>(
    "SELECT p.legacy_id_user AS legacy_id, e.id FROM employees e JOIN employee_profiles p ON p.employee_id = e.id WHERE p.legacy_id_user IS NOT NULL",
  );
  const employeeIdByLegacy = new Map((empRows as any[]).map((r) => [r.legacy_id, r.id]));

  let migrated = 0;
  let skippedNoEmployee = 0;
  let skippedBadType = 0;

  for (const r of rows as any[]) {
    const employeeId = employeeIdByLegacy.get(r.id_user);
    if (!employeeId) {
      console.warn(`  lewati id_tube=${r.id_tube}: id_user=${r.id_user} tidak ketemu padanan employees`);
      skippedNoEmployee++;
      continue;
    }
    const type = mapTubeType(r.jenis_tube);
    if (!type) {
      console.warn(`  lewati id_tube=${r.id_tube}: jenis_tube=${r.jenis_tube} tidak dikenali`);
      skippedBadType++;
      continue;
    }

    // tgl_tube di sumber varchar bebas format -- simpan null kalau bukan tanggal valid,
    // start_date bukan field kritis untuk kalkulasi (cuma status aktif/selesai yang dipakai).
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(r.tgl_tube) ? r.tgl_tube : null;

    await target.execute(
      `INSERT INTO study_assignments (legacy_id_tube, employee_id, type, start_date, status)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employee_id = VALUES(employee_id), type = VALUES(type), start_date = VALUES(start_date), status = VALUES(status)`,
      [r.id_tube, employeeId, type, startDate, mapTubeStatus(r.status_tube)],
    );
    migrated++;
  }

  console.log(
    `  study_assignments: ${(rows as any[]).length} baris sumber, ${migrated} dimigrasikan, ` +
      `${skippedNoEmployee} dilewati (id_user tidak ketemu), ${skippedBadType} dilewati (jenis_tube tidak dikenali)`,
  );
}

async function main() {
  const source = await connectSource();
  const target = await connectTarget();

  try {
    console.log("Migrasi tukin (nominal kelas jabatan, grade non-ASN, tugas belajar)...");
    await migrateJobClassAmounts(source, target);
    await migrateNonpnsGradeAmounts(source, target);
    await migrateStudyAssignments(source, target);
    console.log("Migrasi tukin selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
