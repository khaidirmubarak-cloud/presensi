// Migrasi sekali-jalan: tabel `status`/`ijin` di database cobakinerja -> leave_types/
// leave_requests di database MariaDB yang dipakai bersama dashboard-kinerja/kinerja
// (Fase 4: Ketidakhadiran).
//
// `ijin_detail` (materialized per-hari) TIDAK dimigrasikan -- skema baru menghitung
// keterlibatan per-tanggal saat baca (lihat lib/attendance-status.ts), bukan simpan
// per-hari seperti cobakinerja.
//
// Aman dijalankan ulang: leave_types pakai INSERT IGNORE, leave_requests pakai upsert by
// legacy_id_ijin.
//
// Jalankan: npm run migrate:leave
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

function normalizeStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function mapStatusIjin(v: string): "pengajuan" | "disetujui" | "ditolak" {
  if (v === "disetujui") return "disetujui";
  if (v === "tidak disetujui") return "ditolak";
  return "pengajuan";
}

async function migrateLeaveTypes(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>(
    "SELECT id_status, nama_status, potongan, urut FROM status",
  );
  for (const s of rows as any[]) {
    await target.execute(
      "INSERT IGNORE INTO leave_types (id, name, tukin_deduction_percent, sort_order) VALUES (?, ?, ?, ?)",
      [s.id_status, s.nama_status, s.potongan, s.urut],
    );
  }
  console.log(`  leave_types: ${(rows as any[]).length} baris`);
}

async function migrateLeaveRequests(source: mysql.Connection, target: mysql.Connection) {
  const [rows] = await source.query<any[]>(
    "SELECT id_ijin, id_user, id_status, tgl_mulai, tgl_selesai, keterangan, status_ijin FROM ijin ORDER BY id_ijin",
  );

  const [leaveTypeRows] = await target.query<any[]>("SELECT id FROM leave_types");
  const validLeaveTypeIds = new Set((leaveTypeRows as any[]).map((r) => r.id));

  let migrated = 0;
  let skippedNoEmployee = 0;
  let skippedBadStatus = 0;

  for (const r of rows as any[]) {
    // Data lama tidak konsisten -- beberapa id_status di ijin (mis. 'nu', 'S2', 'TA') tidak
    // punya padanan di tabel status sama sekali (ditemukan lewat pengecekan langsung ke
    // data live, bukan asumsi). Lewati dengan warning, jangan sampai gagal seluruh migrasi.
    if (!validLeaveTypeIds.has(r.id_status)) {
      console.warn(`  lewati id_ijin=${r.id_ijin}: id_status=${r.id_status} tidak ada di leave_types`);
      skippedBadStatus++;
      continue;
    }

    const [empRows] = await target.query<any[]>(
      "SELECT e.id FROM employees e JOIN employee_profiles p ON p.employee_id = e.id WHERE p.legacy_id_user = ?",
      [r.id_user],
    );
    const employeeId = (empRows as any[])[0]?.id;
    if (!employeeId) {
      console.warn(`  lewati id_ijin=${r.id_ijin}: id_user=${r.id_user} tidak ketemu padanan employees`);
      skippedNoEmployee++;
      continue;
    }

    await target.execute(
      `INSERT INTO leave_requests (legacy_id_ijin, employee_id, leave_type_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         employee_id = VALUES(employee_id), leave_type_id = VALUES(leave_type_id),
         start_date = VALUES(start_date), end_date = VALUES(end_date),
         reason = VALUES(reason), status = VALUES(status)`,
      [
        r.id_ijin,
        employeeId,
        r.id_status,
        r.tgl_mulai,
        r.tgl_selesai,
        normalizeStr(r.keterangan),
        mapStatusIjin(r.status_ijin),
      ],
    );
    migrated++;
  }

  console.log(
    `  leave_requests: ${(rows as any[]).length} baris sumber, ${migrated} dimigrasikan, ` +
      `${skippedNoEmployee} dilewati (id_user tidak ketemu), ${skippedBadStatus} dilewati (id_status tidak valid)`,
  );
}

async function main() {
  const source = await connectSource();
  const target = await connectTarget();

  try {
    console.log("Migrasi ketidakhadiran (status, ijin)...");
    await migrateLeaveTypes(source, target);
    await migrateLeaveRequests(source, target);
    console.log("Migrasi ketidakhadiran selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
