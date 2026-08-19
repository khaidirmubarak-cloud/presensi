// Migrasi sekali-jalan: tabel `lembur` di database cobakinerja -> overtime_events/
// overtime_participants di database MariaDB yang dipakai bersama dashboard-kinerja/
// kinerja (Fase 5: Lembur).
//
// `peserta` di cobakinerja adalah CSV daftar id_user (many-to-many dipaksa jadi string)
// -- di sini dinormalisasi jadi baris-baris overtime_participants asli.
//
// Aman dijalankan ulang: overtime_events pakai upsert by legacy_id_lembur,
// overtime_participants di-replace penuh (delete lalu insert ulang) tiap event.
//
// Jalankan: npm run migrate:lembur
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
    console.log("Migrasi lembur...");

    const [rows] = await source.query<any[]>(
      "SELECT id_lembur, peserta, tanggal, lama, keperluan FROM lembur ORDER BY id_lembur",
    );

    // Dimuat sekali ke memori -- sama pola seperti migrate-leave-from-cobakinerja.ts,
    // query per-baris lewat tunnel SSH terlalu lambat untuk ribuan baris.
    const [empRows] = await target.query<any[]>(
      "SELECT p.legacy_id_user AS legacy_id, e.id FROM employees e JOIN employee_profiles p ON p.employee_id = e.id WHERE p.legacy_id_user IS NOT NULL",
    );
    const employeeIdByLegacy = new Map((empRows as any[]).map((r) => [r.legacy_id, r.id]));

    let migrated = 0;
    let skippedNoParticipant = 0;
    let skippedParticipants = 0;

    for (const r of rows as any[]) {
      const legacyParticipantIds = String(r.peserta ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");

      const employeeIds: string[] = [];
      for (const legacyId of legacyParticipantIds) {
        const employeeId = employeeIdByLegacy.get(Number(legacyId));
        if (!employeeId) {
          console.warn(
            `  lembur id_lembur=${r.id_lembur}: peserta id_user=${legacyId} tidak ketemu padanan employees, dilewati`,
          );
          skippedParticipants++;
          continue;
        }
        employeeIds.push(employeeId);
      }

      if (employeeIds.length === 0) {
        console.warn(`  lewati id_lembur=${r.id_lembur}: tidak ada peserta yang valid`);
        skippedNoParticipant++;
        continue;
      }

      await target.execute(
        `INSERT INTO overtime_events (legacy_id_lembur, event_date, hours, purpose)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE event_date = VALUES(event_date), hours = VALUES(hours), purpose = VALUES(purpose)`,
        [r.id_lembur, r.tanggal, r.lama || 0, r.keperluan || null],
      );

      const [eventRows] = await target.query<any[]>(
        "SELECT id FROM overtime_events WHERE legacy_id_lembur = ?",
        [r.id_lembur],
      );
      const overtimeEventId = (eventRows as any[])[0].id;

      await target.execute("DELETE FROM overtime_participants WHERE overtime_event_id = ?", [overtimeEventId]);
      const placeholders = employeeIds.map(() => "(?, ?)").join(", ");
      const params = employeeIds.flatMap((id) => [overtimeEventId, id]);
      await target.execute(
        `INSERT INTO overtime_participants (overtime_event_id, employee_id) VALUES ${placeholders}`,
        params,
      );

      migrated++;
    }

    console.log(
      `  overtime_events: ${(rows as any[]).length} baris sumber, ${migrated} dimigrasikan, ` +
        `${skippedNoParticipant} dilewati (tidak ada peserta valid), ${skippedParticipants} peserta dilewati (id_user tidak ketemu)`,
    );
    console.log("Migrasi lembur selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
