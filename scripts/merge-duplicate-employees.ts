// Gabungkan pegawai ganda + bersihkan NIP (sekali jalan, aman dijalankan ulang).
//
// Latar belakang: NIP dari cobakinerja ada yang membawa karakter tak terlihat / encoding rusak
// ("â€Œ198706032025212019"), sehingga sync Sevima tidak mengenalinya dan membuat baris kedua
// ("198706032025212019"). Login SIAKAD/Google, nomor WA, laporan, dan RHK pegawai bisa saja
// sudah menempel ke baris Sevima itu -- jadi baris ganda DIGABUNG, bukan dihapus begitu saja.
//
// Langkah:
//   1. Kelompokkan pegawai berdasarkan NIP yang dibersihkan (lib/nip.ts).
//   2. Untuk kelompok >1 baris dengan TEPAT SATU baris asal cobakinerja (punya legacy_id_user):
//      baris cobakinerja dipertahankan; semua data yang merujuk ke baris lain (dideteksi dari
//      FOREIGN KEY di information_schema: laporan, presensi WA, RHK, email login, kode WA, cuti,
//      dst.) dipindah ke baris cobakinerja; ID finger & nomor WA dipindah bila baris
//      cobakinerja belum punya; baris lain dihapus. Satu transaksi per kelompok.
//      Kelompok lain (0 atau >1 baris cobakinerja) hanya DILAPORKAN untuk dicek manual.
//   3. Bersihkan NIP (employees.nip) dan NIDN/NIP lama (employee_profiles) yang masih kotor.
//
// Jalankan (env DB_* ke database produksi, lewat tunnel seperti migrasi delta):
//   npm run fix:pegawai-ganda            -> DRY RUN, hanya laporan, tidak mengubah apa pun
//   npm run fix:pegawai-ganda -- --apply -> benar-benar mengubah (BACKUP DATABASE DULU)

import mysql from "mysql2/promise";
import { cleanNip } from "../lib/nip";

const APPLY = process.argv.includes("--apply");

// Tabel hasil perhitungan yang boleh dihapus (bisa dihitung ulang lewat tombol Hitung) kalau
// barisnya bentrok unik saat dipindah (mis. tukin_calculations employee_id+period).
const RECALCULABLE = new Set(["tukin_calculations", "meal_allowance_calculations"]);

type Emp = {
  id: string;
  name: string;
  nip: string | null;
  phone_number: string | null;
  status: string;
  role: string;
  finger_id: number | null;
  department: string | null;
  legacy_id_user: string | null;
  nidn: string | null;
  nip_lama: string | null;
};
type Fk = { table: string; column: string; deleteRule: string };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env var ${name} wajib diisi.`);
  return v;
}

const show = (s: string | null) => (s === null ? "-" : JSON.stringify(s));
const label = (e: Emp) =>
  `${e.name} | NIP ${show(e.nip)}${e.nidn ? ` | NIDN ${e.nidn}` : ""} | ${e.legacy_id_user ? `cobakinerja ${e.legacy_id_user}` : "Sevima/manual"}` +
  ` | finger ${e.finger_id ?? "-"} | WA ${e.phone_number ?? "-"}${e.role === "admin" ? " | ADMIN" : ""}`;

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

  const [fkRows] = await db.query<any[]>(
    `SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, r.DELETE_RULE AS d
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.REFERENCED_TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'employees'
       AND k.REFERENCED_COLUMN_NAME = 'id'`,
  );
  const fks: Fk[] = fkRows.map((r) => ({ table: r.t, column: r.c, deleteRule: r.d }));
  console.log(`Tabel yang merujuk pegawai: ${fks.map((f) => `${f.table}.${f.column}`).join(", ")}\n`);

  const [empRows] = await db.query<any[]>(
    `SELECT e.id, e.name, e.nip, e.phone_number, e.status, e.role, e.finger_id, e.department,
            p.legacy_id_user, p.nidn, p.nip_lama
     FROM employees e LEFT JOIN employee_profiles p ON p.employee_id = e.id`,
  );
  const employees = empRows as Emp[];

  // Dua baris dianggap orang yang sama bila berbagi identitas (setelah dibersihkan): NIP sama,
  // ATAU NIP baris satu = NIDN / NIP lama di profil baris lain. Kasus kedua terjadi pada dosen:
  // field "nip" di Sevima /dosen sering berisi NIDN, sedangkan baris cobakinerja menyimpan NIP
  // resmi di employees.nip dan NIDN di employee_profiles.nidn. Digabung dengan union-find.
  const parent = new Map<string, string>(employees.map((e) => [e.id, e.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const ownerOfKey = new Map<string, string>();
  for (const e of employees) {
    for (const raw of [e.nip, e.nidn, e.nip_lama]) {
      const key = cleanNip(raw).toLowerCase();
      if (key.length < 8) continue; // abaikan isian pendek/sampah yang bisa salah menyambung
      const other = ownerOfKey.get(key);
      if (other) parent.set(find(e.id), find(other));
      else ownerOfKey.set(key, e.id);
    }
  }
  const components = new Map<string, Emp[]>();
  for (const e of employees) {
    const root = find(e.id);
    const list = components.get(root) ?? [];
    list.push(e);
    components.set(root, list);
  }
  const dupGroups: [string, Emp[]][] = [...components.values()]
    .filter((list) => list.length > 1)
    .map((list) => {
      const main = list.find((e) => e.legacy_id_user) ?? list[0];
      return [cleanNip(main.nip).toLowerCase(), list];
    });

  // ---------------------------------------------------------------- 1+2. Gabung
  let merged = 0;
  let planned = 0;
  const manual: string[] = [];
  // Untuk laporan dry run: baris yang akan dihapus (donor) & dipertahankan (NIP-nya dibersihkan
  // saat digabung), supaya tahap bersihkan NIP tidak salah melaporkan bentrok.
  const plannedDonors = new Set<string>();
  const plannedKeepers = new Set<string>();
  console.log(`--- Pegawai ganda: ${dupGroups.length} kelompok ---`);

  for (const [key, list] of dupGroups) {
    const keepers = list.filter((e) => e.legacy_id_user);
    if (keepers.length !== 1) {
      manual.push(
        `NIP ${key}: ${keepers.length === 0 ? "tidak ada baris cobakinerja" : `${keepers.length} baris cobakinerja`}\n` +
          list.map((e) => `      - ${label(e)}`).join("\n"),
      );
      continue;
    }
    const keeper = keepers[0];
    const donors = list.filter((e) => e.id !== keeper.id);
    planned++;
    plannedKeepers.add(keeper.id);
    for (const d of donors) plannedDonors.add(d.id);

    console.log(`\nNIP ${key}`);
    console.log(`  PERTAHANKAN: ${label(keeper)}`);
    for (const d of donors) {
      const counts: string[] = [];
      for (const fk of fks) {
        const [[c]] = await db.query<any[]>(`SELECT COUNT(*) AS n FROM \`${fk.table}\` WHERE \`${fk.column}\` = ?`, [d.id]);
        if (Number(c.n) > 0) counts.push(`${fk.table} ${c.n}`);
      }
      console.log(`  GABUNG+HAPUS: ${label(d)}`);
      console.log(`      data yang dipindah: ${counts.length ? counts.join(", ") : "(tidak ada)"}`);
      if (d.phone_number && keeper.phone_number && d.phone_number !== keeper.phone_number) {
        console.log(`      ! nomor WA berbeda: tetap pakai ${keeper.phone_number}, ${d.phone_number} dilepas`);
      }
      if (d.finger_id && keeper.finger_id && d.finger_id !== keeper.finger_id) {
        console.log(`      ! ID finger berbeda: tetap pakai ${keeper.finger_id}, ${d.finger_id} dilepas`);
      }
    }

    if (!APPLY) continue;

    await db.beginTransaction();
    try {
      for (const d of donors) {
        // Pindahkan semua rujukan. UPDATE IGNORE: baris yang bentrok unik dibiarkan di donor,
        // lalu ditangani di bawah (dihapus bila tabel hasil hitung, selain itu batal).
        for (const fk of fks) {
          await db.query(`UPDATE IGNORE \`${fk.table}\` SET \`${fk.column}\` = ? WHERE \`${fk.column}\` = ?`, [keeper.id, d.id]);
          if (fk.deleteRule === "CASCADE" || fk.deleteRule === "SET NULL") continue;
          const [[left]] = await db.query<any[]>(`SELECT COUNT(*) AS n FROM \`${fk.table}\` WHERE \`${fk.column}\` = ?`, [d.id]);
          if (Number(left.n) === 0) continue;
          if (!RECALCULABLE.has(fk.table)) {
            throw new Error(`${left.n} baris ${fk.table} milik ${d.name} bentrok dan tidak bisa dipindah otomatis`);
          }
          await db.query(`DELETE FROM \`${fk.table}\` WHERE \`${fk.column}\` = ?`, [d.id]);
        }

        // Kolom unik di employees: lepas dari donor dulu, baru pasang ke baris yang dipertahankan.
        const setKeeper: string[] = [];
        const params: any[] = [];
        if (!keeper.finger_id && d.finger_id) {
          await db.query("UPDATE employees SET finger_id = NULL WHERE id = ?", [d.id]);
          setKeeper.push("finger_id = ?");
          params.push(d.finger_id);
          keeper.finger_id = d.finger_id;
        }
        if (!keeper.phone_number && d.phone_number) {
          await db.query("UPDATE employees SET phone_number = NULL WHERE id = ?", [d.id]);
          setKeeper.push("phone_number = ?", "status = ?");
          params.push(d.phone_number, d.status);
          keeper.phone_number = d.phone_number;
        }
        if (d.role === "admin" && keeper.role !== "admin") {
          setKeeper.push("role = 'admin'");
          keeper.role = "admin";
        }
        if (!keeper.department && d.department) {
          setKeeper.push("department = ?");
          params.push(d.department);
        }
        if (setKeeper.length) {
          await db.query(`UPDATE employees SET ${setKeeper.join(", ")} WHERE id = ?`, [...params, keeper.id]);
        }

        await db.query("DELETE FROM employees WHERE id = ?", [d.id]);
      }
      await db.query("UPDATE employees SET nip = ? WHERE id = ?", [cleanNip(keeper.nip), keeper.id]);
      await db.commit();
      merged++;
      console.log("  -> DIGABUNG");
    } catch (err: any) {
      await db.rollback();
      manual.push(`NIP ${key}: GAGAL digabung, dibatalkan (${err.message})`);
      console.log(`  -> GAGAL, dibatalkan: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------- 3. Bersihkan NIP
  const [afterRows] = await db.query<any[]>("SELECT id, name, nip FROM employees WHERE nip IS NOT NULL");
  // Dry run: baris donor dianggap sudah terhapus & NIP keeper dianggap sudah bersih (keduanya
  // terjadi di tahap gabung saat --apply).
  const remaining = (afterRows as { id: string; name: string; nip: string }[]).filter(
    (r) => APPLY || !plannedDonors.has(r.id),
  );
  const taken = new Map<string, string>();
  for (const r of remaining) taken.set(cleanNip(r.nip).toLowerCase(), r.id);
  const dirty = remaining.filter((r) => r.nip !== cleanNip(r.nip) && (APPLY || !plannedKeepers.has(r.id)));

  console.log(`\n--- NIP perlu dibersihkan: ${dirty.length} pegawai ---`);
  let cleaned = 0;
  for (const r of dirty) {
    const clean = cleanNip(r.nip);
    const owner = taken.get(clean.toLowerCase());
    if (!clean) {
      manual.push(`${r.name}: NIP ${show(r.nip)} kosong setelah dibersihkan`);
      continue;
    }
    if (owner && owner !== r.id) {
      manual.push(`${r.name}: NIP bersih ${clean} sudah dipakai pegawai lain (kelompok ganda yang belum digabung)`);
      continue;
    }
    console.log(`  ${r.name}: ${show(r.nip)} -> ${JSON.stringify(clean)}`);
    if (APPLY) {
      await db.query("UPDATE employees SET nip = ? WHERE id = ?", [clean, r.id]);
      cleaned++;
    }
  }

  const [profRows] = await db.query<any[]>(
    "SELECT employee_id, nidn, nip_lama FROM employee_profiles WHERE nidn IS NOT NULL OR nip_lama IS NOT NULL",
  );
  let profCleaned = 0;
  for (const p of profRows) {
    const nidn = p.nidn === null ? null : cleanNip(p.nidn) || null;
    const nipLama = p.nip_lama === null ? null : cleanNip(p.nip_lama) || null;
    if (nidn === p.nidn && nipLama === p.nip_lama) continue;
    profCleaned++;
    if (APPLY) {
      await db.query("UPDATE employee_profiles SET nidn = ?, nip_lama = ? WHERE employee_id = ?", [nidn, nipLama, p.employee_id]);
    }
  }
  console.log(`  NIDN / NIP lama di profil yang perlu dibersihkan: ${profCleaned}`);

  // ---------------------------------------------------------------- 4. Kemungkinan ganda (nama)
  // Baris Sevima/manual yang tidak tersambung lewat NIP/NIDN, tapi namanya (tanpa gelar) sama
  // dengan baris cobakinerja -- mis. NIDN di cobakinerja kosong. HANYA dilaporkan, tidak digabung.
  const normName = (n: string) =>
    n
      .split(",")[0]
      .replace(/\b(prof|dr|drs|dra|ir|h|hj|st|andi)\b\.?/gi, (m) => (/^(andi|st)$/i.test(m.replace(".", "")) ? m : ""))
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  const [currentRows] = await db.query<any[]>(
    `SELECT e.id, e.name, e.nip, p.legacy_id_user, p.nidn
     FROM employees e LEFT JOIN employee_profiles p ON p.employee_id = e.id`,
  );
  const cobaByName = new Map<string, any[]>();
  for (const r of currentRows as any[]) {
    if (!r.legacy_id_user || plannedKeepers.has(r.id)) continue;
    const k = normName(r.name);
    if (!k) continue;
    cobaByName.set(k, [...(cobaByName.get(k) ?? []), r]);
  }
  const nameMatches: string[] = [];
  for (const r of currentRows as any[]) {
    if (r.legacy_id_user || plannedDonors.has(r.id)) continue;
    const hits = cobaByName.get(normName(r.name));
    if (!hits) continue;
    nameMatches.push(
      `${r.name} | NIP ${show(r.nip)} | Sevima/manual  <->  ` +
        hits.map((h) => `${h.name} | NIP ${show(h.nip)} | NIDN ${h.nidn ?? "-"} | cobakinerja ${h.legacy_id_user}`).join("  //  "),
    );
  }
  console.log(`\n--- Kemungkinan ganda berdasarkan nama (cek manual, TIDAK digabung): ${nameMatches.length} ---`);
  for (const m of nameMatches) console.log(`  ${m}`);

  // ---------------------------------------------------------------- Ringkasan
  console.log("\n=== RINGKASAN ===");
  console.log(`Kelompok ganda           : ${dupGroups.length}`);
  console.log(`Digabung                 : ${APPLY ? merged : `${planned} kelompok (akan digabung, NIP-nya ikut dibersihkan)`}`);
  console.log(`NIP lain dibersihkan     : ${APPLY ? cleaned : `${dirty.length} (akan dibersihkan)`}`);
  console.log(`Kemungkinan ganda (nama) : ${nameMatches.length} (cek manual, lihat daftar di atas)`);
  console.log(`Perlu dicek manual       : ${manual.length}`);
  for (const m of manual) console.log(`  - ${m}`);
  if (!APPLY) console.log("\nTidak ada yang diubah. Periksa daftar di atas, lalu jalankan ulang dengan --apply (setelah backup).");

  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
