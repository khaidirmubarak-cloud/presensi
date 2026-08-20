// Perbaikan data sekali-jalan: `employee_profiles.service_years` (dan `rank_id` untuk
// baris yang selisih) salah karena migrasi Fase 1 mengambil dari `user.tahun_mk` yang
// ternyata SELALU 0 di cobakinerja (field mati, tidak pernah diisi kode manapun). Sumber
// yang benar: tabel `masa_kerja` (relasi `id_user`) digabung ke `gaji` lewat `id_gaji`
// (mis. id_gaji="3D-14" -> golongan 3D, masa kerja 14 tahun).
//
// Ditemukan lewat laporan user: 189 dari 543 pegawai punya baris di masa_kerja (mayoritas
// dosen PNS), 177 di antaranya is_serdos='Y' -- jadi potongan awal tunjangan kinerja
// dosen serdos di produksi salah (memakai gaji pokok tahun-0). 26 dari 189 pegawai itu
// juga punya id_golongan yang beda antara `user` vs `masa_kerja`/`gaji` (data masa_kerja
// lebih baru) -- rank_id ikut diperbaiki untuk semuanya (bukan cuma yang 26, supaya
// konsisten satu sumber kebenaran), dikonfirmasi user.
//
// Default: DRY RUN (cuma print rencana perubahan). Jalankan dengan --apply untuk eksekusi
// sungguhan. Aman dijalankan ulang (idempotent -- baris yang sudah benar dilewati).
//
// Jalankan: npx tsx scripts/fix-service-years-from-masa-kerja.ts [--apply]
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
  const apply = process.argv.includes("--apply");
  const source = await connectSource();
  const target = await connectTarget();

  try {
    console.log(apply ? "Mode: APPLY (menulis perubahan)" : "Mode: DRY RUN (cuma preview, tambah --apply untuk eksekusi)");

    const [rows] = await source.query<any[]>(
      `SELECT m.id_user, u.nip, u.nama_lengkap, g.id_golongan, g.masa_kerja
       FROM masa_kerja m
       JOIN user u ON u.id_user = m.id_user
       JOIN gaji g ON g.id_gaji = m.id_gaji`,
    );

    const [rankRows] = await target.query<any[]>("SELECT id FROM ranks");
    const validRankIds = new Set((rankRows as any[]).map((r) => r.id));

    let updated = 0;
    let unchanged = 0;
    let notFound = 0;
    let skippedBadRank = 0;

    for (const r of rows as any[]) {
      if (!validRankIds.has(r.id_golongan)) {
        console.warn(`  lewati id_user=${r.id_user} nip=${r.nip}: golongan ${r.id_golongan} tidak ada di ranks`);
        skippedBadRank++;
        continue;
      }

      const [current] = await target.query<any[]>(
        `SELECT p.employee_id, p.rank_id, p.service_years, e.name
         FROM employee_profiles p JOIN employees e ON e.id = p.employee_id
         WHERE p.legacy_id_user = ?`,
        [r.id_user],
      );
      const row = (current as any[])[0];
      if (!row) {
        console.warn(`  tidak ketemu employee_profiles untuk id_user=${r.id_user} nip=${r.nip} (${r.nama_lengkap})`);
        notFound++;
        continue;
      }

      const rankChanged = row.rank_id !== r.id_golongan;
      const yearsChanged = row.service_years !== r.masa_kerja;
      if (!rankChanged && !yearsChanged) {
        unchanged++;
        continue;
      }

      console.log(
        `  ${row.name} (nip=${r.nip}): rank_id ${row.rank_id ?? "null"} -> ${r.id_golongan}${rankChanged ? " *" : ""}, ` +
          `service_years ${row.service_years ?? "null"} -> ${r.masa_kerja}${yearsChanged ? " *" : ""}`,
      );
      updated++;

      if (apply) {
        await target.execute(
          "UPDATE employee_profiles SET rank_id = ?, service_years = ? WHERE employee_id = ?",
          [r.id_golongan, r.masa_kerja, row.employee_id],
        );
      }
    }

    console.log(
      `\nRingkasan: ${rows.length} baris masa_kerja diproses, ${updated} ${apply ? "diupdate" : "akan diupdate"}, ` +
        `${unchanged} sudah benar, ${notFound} pegawai tidak ketemu, ${skippedBadRank} golongan tidak valid.`,
    );
    if (!apply) {
      console.log("Ini DRY RUN -- tidak ada perubahan ditulis. Jalankan ulang dengan --apply untuk eksekusi.");
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
