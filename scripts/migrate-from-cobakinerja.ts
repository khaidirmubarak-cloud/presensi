// Migrasi sekali-jalan: tabel `user` + tabel referensi di database cobakinerja (MySQL,
// server lama) -> employees/employee_profiles + tabel referensi baru di database MariaDB
// yang dipakai bersama dashboard-kinerja/kinerja.
//
// Aman dijalankan ulang (idempotent): tabel referensi pakai INSERT IGNORE, employees
// dicocokkan by NIP dan tidak pernah menimpa phone_number/password_hash/status/
// registration_token pada baris yang sudah ada, employee_profiles pakai upsert by
// employee_id.
//
// cobakinerja ada di VPS lama (Ubuntu 12.04) yang cuma bisa diakses lewat SSH tunnel --
// SOURCE_DB_* di bawah mengarah ke port tunnel itu (atau ke salinan lokal dump-nya),
// terpisah total dari DB_* (target, MariaDB shared) yang dipakai lib/db.ts aplikasi ini.
//
// Jalankan: npm run migrate:cobakinerja
// Env yang dibutuhkan (lihat .env.example):
//   SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";

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
    // Password sengaja tidak lewat requireEnv -- auth socket lokal (dev) sah pakai
    // password kosong, beda dari host/user/nama-db yang wajib eksplisit.
    password: process.env.SOURCE_DB_PASSWORD || "",
    database: process.env.SOURCE_DB_NAME || "cobakinerja",
    // Tanpa ini, kolom DATE/DATETIME kembali sebagai objek Date JS (di-parse pakai
    // timezone lokal proses ini), bukan string apa adanya -- normalizeDate() di bawah
    // mengasumsikan string 'YYYY-MM-DD' (termasuk mendeteksi placeholder '0000-00-00'),
    // sama seperti disiplin dateStrings di lib/db.ts aplikasi ini.
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

// '0000-00-00' (dan tanggal kosong) -> NULL. Baris valid dikembalikan apa adanya
// (format YYYY-MM-DD, cocok untuk kolom DATE MariaDB).
function normalizeDate(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  if (s.startsWith("0000-00-00")) return null;
  return s.slice(0, 10);
}

function normalizeStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function ynToBool(v: any): number | null {
  const s = normalizeStr(v);
  if (s === null) return null;
  return s === "Y" ? 1 : 0;
}

async function migrateReferenceTables(source: mysql.Connection, target: mysql.Connection) {
  console.log("Migrasi tabel referensi...");

  // golongan -> ranks (skip placeholder '-', bukan golongan sungguhan)
  const [golongan] = await source.query<any[]>(
    "SELECT id_golongan, nama_golongan, pangkat FROM golongan WHERE id_golongan != '-'",
  );
  for (const g of golongan as any[]) {
    await target.execute(
      "INSERT IGNORE INTO ranks (id, code, title) VALUES (?, ?, ?)",
      [g.id_golongan, g.nama_golongan, g.pangkat],
    );
  }
  console.log(`  ranks: ${(golongan as any[]).length} baris`);

  // satker
  const [satker] = await source.query<any[]>("SELECT id_satker, nama_satker FROM satker");
  for (const s of satker as any[]) {
    await target.execute("INSERT IGNORE INTO satker (id, name) VALUES (?, ?)", [
      s.id_satker,
      s.nama_satker,
    ]);
  }
  console.log(`  satker: ${(satker as any[]).length} baris`);

  // unit
  const [unit] = await source.query<any[]>(
    "SELECT id_unit, nama_unit, id_satker FROM unit",
  );
  for (const u of unit as any[]) {
    await target.execute("INSERT IGNORE INTO units (id, name, satker_id) VALUES (?, ?, ?)", [
      u.id_unit,
      u.nama_unit,
      normalizeStr(u.id_satker),
    ]);
  }
  console.log(`  units: ${(unit as any[]).length} baris`);

  // kelas -> job_classes (kolom tukin sengaja tidak dimigrasi, lihat rencana Fase 1)
  const [kelas] = await source.query<any[]>("SELECT id_kelas, nama_kelas FROM kelas");
  for (const k of kelas as any[]) {
    await target.execute("INSERT IGNORE INTO job_classes (id, name) VALUES (?, ?)", [
      k.id_kelas,
      k.nama_kelas,
    ]);
  }
  console.log(`  job_classes: ${(kelas as any[]).length} baris`);

  // fungsional -> functional_positions
  const [fungsional] = await source.query<any[]>(
    "SELECT id_fungs, nama_fungs, id_kelas FROM fungsional",
  );
  for (const f of fungsional as any[]) {
    await target.execute(
      "INSERT IGNORE INTO functional_positions (id, name, job_class_id) VALUES (?, ?, ?)",
      [f.id_fungs, f.nama_fungs, f.id_kelas],
    );
  }
  console.log(`  functional_positions: ${(fungsional as any[]).length} baris`);

  // tukin_nonpns -> tukin_nonpns_grades (kolom tukin sengaja tidak dimigrasi)
  const [tukinNonpns] = await source.query<any[]>(
    "SELECT grade_tukin, nama_tukin FROM tukin_nonpns",
  );
  for (const t of tukinNonpns as any[]) {
    await target.execute("INSERT IGNORE INTO tukin_nonpns_grades (id, name) VALUES (?, ?)", [
      t.grade_tukin,
      t.nama_tukin,
    ]);
  }
  console.log(`  tukin_nonpns_grades: ${(tukinNonpns as any[]).length} baris`);
}

async function migrateEmployees(source: mysql.Connection, target: mysql.Connection) {
  console.log("Migrasi pegawai (tabel user)...");

  const [rows] = await source.query<any[]>("SELECT * FROM user");
  let created = 0;
  let matched = 0;
  let skipped = 0;

  // Data sumber ternyata tidak sebersih asumsi awal (ditemukan saat dry-run terhadap
  // 543 baris asli, bukan sampel 131-baris-semua-PNS yang salah dipakai sebelumnya):
  // ada NIP dobel (2-3 pasang) dan id_finger dobel (termasuk banyak baris id_finger=0
  // sebagai sentinel "belum di-assign mesin"). Dua Set ini mencegah migrasi
  // menimpa/menggabung baris secara diam-diam saat ketemu itu -- baris kedua yang
  // konflik dilewati dan dicatat sebagai warning, bukan bikin migrasi crash atau
  // salah gabung dua pegawai berbeda jadi satu employees row.
  const processedNips = new Set<string>();
  const [existingFingerRows] = await target.query<any[]>(
    "SELECT finger_id FROM employees WHERE finger_id IS NOT NULL",
  );
  const usedFingerIds = new Set<number>((existingFingerRows as any[]).map((r) => r.finger_id));

  // ownCurrentFingerId: kalau baris employees ini SUDAH punya finger_id ini persis
  // (dari run sebelumnya), itu bukan konflik -- cuma menegaskan ulang nilai yang sama.
  // Tanpa pengecualian ini, run kedua akan menganggap "punya sendiri" sebagai bentrok
  // dengan "sudah dipakai" (di-preload dari DB), lalu diam-diam menge-NULL-kan
  // finger_id di setiap run ulang -- ditemukan lewat tes idempotency sebelum dianggap
  // aman dipakai berkali-kali.
  function resolveFingerId(idUser: string, rawId: any, ownCurrentFingerId: number | null): number | null {
    const id = Number(rawId);
    if (!id) return null; // 0 / kosong = sentinel "belum di-assign", bukan id sungguhan
    if (id === ownCurrentFingerId) return id;
    if (usedFingerIds.has(id)) {
      console.warn(`  id_user=${idUser}: id_finger=${id} sudah dipakai baris lain, dilewati (finger_id diset NULL)`);
      return null;
    }
    usedFingerIds.add(id);
    return id;
  }

  for (const u of rows as any[]) {
    const nip = normalizeStr(u.nip);
    if (!nip) {
      console.warn(`  lewati id_user=${u.id_user}: NIP kosong`);
      skipped++;
      continue;
    }
    if (processedNips.has(nip)) {
      console.warn(`  lewati id_user=${u.id_user}: NIP ${nip} sudah dipakai baris user lain di data sumber (duplikat NIP di cobakinerja, perlu dicek manual)`);
      skipped++;
      continue;
    }
    processedNips.add(nip);

    const [existingRows] = await target.execute<any[]>(
      "SELECT id, department, finger_id FROM employees WHERE nip = ?",
      [nip],
    );
    let employeeId: string;

    if ((existingRows as any[]).length > 0) {
      const existing = (existingRows as any[])[0];
      employeeId = existing.id;
      matched++;
      const fingerId = resolveFingerId(u.id_user, u.id_finger, existing.finger_id);
      // Jangan pernah sentuh phone_number/password_hash/status/registration_token* di
      // sini -- itu domain klaim-akun WA. Cuma isi department kalau masih kosong.
      await target.execute(
        "UPDATE employees SET department = COALESCE(department, ?), finger_id = ? WHERE id = ?",
        [normalizeStr(u.jabatan), fingerId, employeeId],
      );
    } else {
      employeeId = randomUUID();
      created++;
      const fingerId = resolveFingerId(u.id_user, u.id_finger, null);
      await target.execute(
        "INSERT INTO employees (id, name, nip, department, status, role, finger_id) VALUES (?, ?, ?, ?, 'pending', 'pegawai', ?)",
        [employeeId, u.nama_lengkap, nip, normalizeStr(u.jabatan), fingerId],
      );
    }

    await target.execute(
      `INSERT INTO employee_profiles (
         employee_id, legacy_id_user, legacy_id_pegawai,
         nip_lama, nidn, bank_account_no, npwp, birth_date, photo_url,
         rank_id, unit_id, job_class_id, functional_position_id, tukin_nonpns_grade_id,
         position_title, position_effective_date, rank_effective_date,
         service_years, service_months, retirement_date,
         employee_category, employment_status,
         is_pegawai, is_dosen, is_serdos, lecturer_type, uses_shift,
         gets_meal_allowance, tukin_grade
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         legacy_id_user = VALUES(legacy_id_user), legacy_id_pegawai = VALUES(legacy_id_pegawai),
         nip_lama = VALUES(nip_lama), nidn = VALUES(nidn), bank_account_no = VALUES(bank_account_no),
         npwp = VALUES(npwp), birth_date = VALUES(birth_date), photo_url = VALUES(photo_url),
         rank_id = VALUES(rank_id), unit_id = VALUES(unit_id), job_class_id = VALUES(job_class_id),
         functional_position_id = VALUES(functional_position_id),
         tukin_nonpns_grade_id = VALUES(tukin_nonpns_grade_id),
         position_title = VALUES(position_title),
         position_effective_date = VALUES(position_effective_date),
         rank_effective_date = VALUES(rank_effective_date),
         service_years = VALUES(service_years), service_months = VALUES(service_months),
         retirement_date = VALUES(retirement_date),
         employee_category = VALUES(employee_category), employment_status = VALUES(employment_status),
         is_pegawai = VALUES(is_pegawai), is_dosen = VALUES(is_dosen), is_serdos = VALUES(is_serdos),
         lecturer_type = VALUES(lecturer_type), uses_shift = VALUES(uses_shift),
         gets_meal_allowance = VALUES(gets_meal_allowance), tukin_grade = VALUES(tukin_grade)`,
      [
        employeeId,
        u.id_user,
        u.id_pegawai || null,
        normalizeStr(u.nip_lama),
        normalizeStr(u.nidn),
        normalizeStr(u.norek_peg),
        normalizeStr(u.npwp),
        normalizeDate(u.tgl_lahir),
        normalizeStr(u.foto),
        // '-' dan 'nu' ("n/a", dipakai pegawai kategori non-PNS tanpa golongan resmi)
        // sama-sama bukan baris di ranks -> map ke NULL, bukan cuma '-' saja (ditemukan
        // saat dry-run terhadap data lengkap 543 baris -- 132 baris pakai 'nu').
        ["-", "nu"].includes(u.id_golongan) ? null : normalizeStr(u.id_golongan),
        normalizeStr(u.id_unit),
        u.id_kelas || null,
        // id_fungs='0' juga placeholder "tidak berlaku" (22 baris), bukan FK sungguhan
        // ke functional_positions.
        u.id_fungs === "0" ? null : normalizeStr(u.id_fungs),
        u.grade_tukin || null,
        normalizeStr(u.jabatan),
        normalizeDate(u.tmt_jabatan),
        normalizeDate(u.tmt_pangkat),
        u.tahun_mk ?? null,
        u.bulan_mk ?? null,
        normalizeDate(u.tmt_pensiun),
        normalizeStr(u.status),
        u.blokir === "T" ? "aktif" : "nonaktif",
        ynToBool(u.pegawai),
        ynToBool(u.dosen),
        ynToBool(u.serdos),
        normalizeStr(u.jenis_dosen),
        u.shift === "Y" ? 1 : 0,
        u.uang_makan === "T" ? 0 : 1,
        u.grade_tukin || null,
      ],
    );
  }

  console.log(
    `  selesai: ${created} pegawai baru, ${matched} baris employees existing dilengkapi, ${skipped} baris dilewati (lihat warning di atas).`,
  );
}

async function main() {
  const source = await connectSource();
  const target = await connectTarget();
  try {
    await migrateReferenceTables(source, target);
    await migrateEmployees(source, target);
    console.log("Migrasi selesai.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
