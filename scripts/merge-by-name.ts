// Gabungkan baris pegawai hasil sync Sevima ke baris cobakinerja berdasarkan NAMA, untuk kasus
// yang tidak tersambung lewat nomor apa pun -- terutama dosen yang field "nip"-nya di Sevima
// berisi NIDN sementara NIDN di profil cobakinerja kosong. Lanjutan `npm run fix:pegawai-ganda`.
//
// Hanya digabung OTOMATIS bila semua syarat terpenuhi (selain itu dilaporkan "manual"):
//   1. Nama (tanpa gelar, lihat normPersonName) cocok dengan TEPAT SATU baris cobakinerja, dan
//      baris cobakinerja itu hanya cocok dengan SATU baris Sevima/manual (tanpa nama kembar).
//   2. NIDN di profil cobakinerja kosong atau sama dengan NIP baris Sevima.
//   3. Bukan kasus dua NIP resmi 18 digit yang berbeda (kemungkinan besar orang berbeda).
// Saat digabung, nomor di baris Sevima disimpan ke profil cobakinerja (NIDN bila 10 digit, selain
// itu ke nip_lama) -- supaya sync berikutnya langsung mengenalinya.
//
// Jalankan (env DB_* ke produksi lewat tunnel, sama seperti fix:pegawai-ganda):
//   npm run fix:pegawai-ganda-nama                      -> DRY RUN
//   npm run fix:pegawai-ganda-nama -- --csv=/tmp/a.csv  -> DRY RUN + daftar lengkap ke CSV
//   npm run fix:pegawai-ganda-nama -- --apply           -> gabungkan yang OTOMATIS (BACKUP DULU)

import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { cleanNip } from "../lib/nip";
import { loadEmployeeFks, countReferences, mergeDonorsInto, normPersonName, type MergeEmp } from "./lib-merge-employees";

const APPLY = process.argv.includes("--apply");
const CSV = process.argv.find((a) => a.startsWith("--csv="))?.slice("--csv=".length);

type Row = MergeEmp & { legacy_id_user: string | null; nidn: string | null };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ${name} wajib diisi.`);
  return v;
}

const is18 = (nip: string | null) => /^\d{18}$/.test(cleanNip(nip));
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

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

  const fks = await loadEmployeeFks(db);
  const [rows] = await db.query<any[]>(
    `SELECT e.id, e.name, e.nip, e.phone_number, e.status, e.role, e.finger_id, e.department,
            p.legacy_id_user, p.nidn
     FROM employees e LEFT JOIN employee_profiles p ON p.employee_id = e.id`,
  );
  const all = rows as Row[];

  const byName = new Map<string, { coba: Row[]; other: Row[] }>();
  for (const r of all) {
    const k = normPersonName(r.name);
    if (!k) continue;
    const g = byName.get(k) ?? { coba: [], other: [] };
    (r.legacy_id_user ? g.coba : g.other).push(r);
    byName.set(k, g);
  }

  type Pair = { donor: Row; keeper: Row | null; candidates: Row[]; status: "OTOMATIS" | "MANUAL"; reason: string; data: string };
  const pairs: Pair[] = [];
  for (const g of byName.values()) {
    if (g.coba.length === 0 || g.other.length === 0) continue;
    for (const donor of g.other) {
      let keeper: Row | null = g.coba.length === 1 ? g.coba[0] : null;
      let reason = "";
      if (g.coba.length > 1) reason = `nama sama dengan ${g.coba.length} baris cobakinerja`;
      else if (g.other.length > 1) reason = `nama sama dengan ${g.other.length} baris Sevima/manual`;
      else if (keeper!.nidn && !is18(donor.nip) && cleanNip(keeper!.nidn) !== cleanNip(donor.nip))
        reason = `NIDN cobakinerja ${keeper!.nidn} berbeda`;
      else if (is18(donor.nip) && is18(keeper!.nip) && cleanNip(donor.nip) !== cleanNip(keeper!.nip)) reason = "dua NIP 18 digit berbeda";
      const data = (await countReferences(db, fks, donor.id)).join(", ") || "-";
      pairs.push({ donor, keeper, candidates: g.coba, status: reason ? "MANUAL" : "OTOMATIS", reason, data });
    }
  }

  const auto = pairs.filter((p) => p.status === "OTOMATIS");
  const manual = pairs.filter((p) => p.status === "MANUAL");

  console.log(`\n--- OTOMATIS (akan digabung): ${auto.length} ---`);
  for (const p of auto) {
    console.log(
      `  ${p.donor.name} [${cleanNip(p.donor.nip)}]  ->  ${p.keeper!.name} [${cleanNip(p.keeper!.nip)} | finger ${p.keeper!.finger_id ?? "-"}]` +
        `${p.data !== "-" ? ` | pindah: ${p.data}` : ""}`,
    );
  }
  console.log(`\n--- MANUAL (tidak digabung): ${manual.length} ---`);
  for (const p of manual) {
    const cands = p.candidates.map((c) => `${c.name} [${cleanNip(c.nip)}${c.nidn ? ` | NIDN ${c.nidn}` : ""}]`).join(" / ");
    console.log(`  ${p.donor.name} [${cleanNip(p.donor.nip)}]: ${p.reason}  ->  kandidat: ${cands}`);
  }

  if (CSV) {
    const lines = [
      ["status", "alasan", "nama_sevima", "nip_sevima", "nama_cobakinerja", "nip_cobakinerja", "nidn_cobakinerja", "finger", "data_dipindah"].join(","),
      ...pairs.map((p) =>
        [
          p.status,
          p.reason,
          p.donor.name,
          cleanNip(p.donor.nip),
          p.candidates.map((c) => c.name).join(" / "),
          p.candidates.map((c) => cleanNip(c.nip)).join(" / "),
          p.candidates.map((c) => c.nidn ?? "").join(" / "),
          p.candidates.map((c) => c.finger_id ?? "").join(" / "),
          p.data,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    writeFileSync(CSV, "﻿" + lines.join("\n"));
    console.log(`\nDaftar lengkap ditulis ke ${CSV} (buka dengan Excel/Google Sheets).`);
  }

  let merged = 0;
  const failed: string[] = [];
  if (APPLY) {
    for (const p of auto) {
      const keeper = p.keeper!;
      await db.beginTransaction();
      try {
        await mergeDonorsInto(db, fks, keeper, [p.donor]);
        // Simpan nomor dari baris Sevima ke profil supaya sync berikutnya langsung mengenali
        // pegawai ini (sync mencocokkan ke employees.nip, profil nidn, dan nip_lama):
        //   - 10 digit (format NIDN)            -> employee_profiles.nidn (VARCHAR 10)
        //   - lainnya, bukan NIP 18 digit, <=21 -> employee_profiles.nip_lama (VARCHAR 21),
        //     mis. Sevima mencatat NIK/NUPTK/kode lain di field "nip"
        const donorNip = cleanNip(p.donor.nip);
        if (/^\d{10}$/.test(donorNip)) {
          await db.query(
            `INSERT INTO employee_profiles (employee_id, nidn) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE nidn = COALESCE(nidn, VALUES(nidn))`,
            [keeper.id, donorNip],
          );
        } else if (donorNip && !is18(donorNip) && donorNip.length <= 21) {
          await db.query(
            `INSERT INTO employee_profiles (employee_id, nip_lama) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE nip_lama = COALESCE(nip_lama, VALUES(nip_lama))`,
            [keeper.id, donorNip],
          );
        }
        await db.commit();
        merged++;
      } catch (err: any) {
        await db.rollback();
        failed.push(`${p.donor.name}: ${err.message}`);
      }
    }
  }

  console.log("\n=== RINGKASAN ===");
  console.log(`Pasangan nama ditemukan : ${pairs.length}`);
  console.log(`Otomatis                : ${auto.length}${APPLY ? ` (digabung ${merged})` : " (akan digabung)"}`);
  console.log(`Manual                  : ${manual.length} (isi NIDN di detail pegawai cobakinerja, lalu jalankan fix:pegawai-ganda)`);
  if (failed.length) {
    console.log(`Gagal & dibatalkan      : ${failed.length}`);
    for (const f of failed) console.log(`  - ${f}`);
  }
  if (!APPLY) console.log("\nTidak ada yang diubah. Periksa daftar di atas (atau CSV), lalu jalankan ulang dengan --apply (setelah backup).");

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
