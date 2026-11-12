// Keluarkan dosen kontrak/LB (NIP berawalan "LB", lihat EXCLUDED_NIP_PREFIXES di lib/nip.ts)
// yang terlanjur diimpor dari Sevima. Mereka tidak diperhitungkan di presensi, tunjangan kinerja,
// maupun uang makan, dan tidak memakai LKH.
//
// Per pegawai LB:
//   - HAPUS   bila bukan dari cobakinerja dan tidak punya data apa pun di tabel yang merujuk
//             pegawai (selain email login / kode WA / profil, yang ikut terhapus otomatis).
//   - NONAKTIF bila punya data (laporan, presensi, RHK, cuti, tukin, dst.) atau berasal dari
//             cobakinerja -- dihapus akan membuat laporannya kehilangan pemilik, jadi cukup
//             employment_status = 'nonaktif': otomatis keluar dari presensi/tukin/uang makan
//             dan tidak bisa login LKH.
//
// Jalankan (env DB_* ke database produksi, lewat tunnel seperti migrasi delta):
//   npm run fix:hapus-dosen-lb            -> DRY RUN, hanya laporan
//   npm run fix:hapus-dosen-lb -- --apply -> eksekusi (BACKUP DATABASE DULU)

import mysql from "mysql2/promise";
import { EXCLUDED_NIP_PREFIXES, isExcludedNip } from "../lib/nip";

const APPLY = process.argv.includes("--apply");

// Rujukan yang ikut terhapus bersama pegawai dan tidak bernilai sebagai riwayat kerja.
const TRIVIAL_TABLES = new Set(["employee_profiles", "employee_login_emails", "wa_link_codes"]);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ${name} wajib diisi.`);
  return v;
}

async function main() {
  const db = await mysql.createConnection({
    host: requireEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    user: requireEnv("DB_USER"),
    password: process.env.DB_PASSWORD || "",
    database: requireEnv("DB_NAME"),
    dateStrings: true,
  });

  console.log(APPLY ? "=== MODE APPLY: database AKAN diubah ===" : "=== DRY RUN: tidak ada yang diubah ===");
  console.log(`Awalan NIP yang dikeluarkan: ${EXCLUDED_NIP_PREFIXES.join(", ")}\n`);

  const [fkRows] = await db.query<any[]>(
    `SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c
     FROM information_schema.KEY_COLUMN_USAGE k
     WHERE k.REFERENCED_TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'employees'
       AND k.REFERENCED_COLUMN_NAME = 'id'`,
  );
  const dataFks = (fkRows as { t: string; c: string }[]).filter((f) => !TRIVIAL_TABLES.has(f.t));

  const [rows] = await db.query<any[]>(
    `SELECT e.id, e.name, e.nip, e.role, e.phone_number, p.legacy_id_user, p.employment_status
     FROM employees e LEFT JOIN employee_profiles p ON p.employee_id = e.id
     WHERE e.nip IS NOT NULL`,
  );
  const targets = (rows as any[]).filter((r) => isExcludedNip(r.nip));

  let toDelete = 0;
  let toDeactivate = 0;
  let alreadyInactive = 0;
  const skipped: string[] = [];

  for (const e of targets) {
    if (e.role === "admin") {
      skipped.push(`${e.name} (${e.nip}): akun ADMIN -- tidak disentuh, cek manual`);
      continue;
    }

    const usage: string[] = [];
    for (const fk of dataFks) {
      const [[c]] = await db.query<any[]>(`SELECT COUNT(*) AS n FROM \`${fk.t}\` WHERE \`${fk.c}\` = ?`, [e.id]);
      if (Number(c.n) > 0) usage.push(`${fk.t} ${c.n}`);
    }

    if (!e.legacy_id_user && usage.length === 0) {
      toDelete++;
      if (APPLY) await db.query("DELETE FROM employees WHERE id = ?", [e.id]);
      continue;
    }

    if (e.employment_status === "nonaktif") {
      alreadyInactive++;
      continue;
    }
    toDeactivate++;
    console.log(
      `  NONAKTIF: ${e.name} (${e.nip})${e.legacy_id_user ? ` | cobakinerja ${e.legacy_id_user}` : ""} | data: ${usage.join(", ") || "(profil cobakinerja)"}`,
    );
    if (APPLY) {
      await db.query(
        `INSERT INTO employee_profiles (employee_id, employment_status) VALUES (?, 'nonaktif')
         ON DUPLICATE KEY UPDATE employment_status = 'nonaktif'`,
        [e.id],
      );
    }
  }

  console.log("\n=== RINGKASAN ===");
  console.log(`Pegawai dengan NIP ${EXCLUDED_NIP_PREFIXES.join("/")}…: ${targets.length}`);
  console.log(`Dihapus (tanpa data)       : ${toDelete}${APPLY ? "" : " (akan dihapus)"}`);
  console.log(`Dinonaktifkan (punya data) : ${toDeactivate}${APPLY ? "" : " (akan dinonaktifkan)"}`);
  console.log(`Sudah nonaktif sebelumnya  : ${alreadyInactive}`);
  console.log(`Perlu dicek manual         : ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s}`);
  if (!APPLY) console.log("\nTidak ada yang diubah. Periksa laporan di atas, lalu jalankan ulang dengan --apply (setelah backup).");

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
