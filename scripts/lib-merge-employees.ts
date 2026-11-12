// Logika penggabungan pegawai ganda, dipakai bersama oleh merge-duplicate-employees.ts (NIP/NIDN
// sama) dan merge-by-name.ts (nama sama, syarat ketat). Dipanggil DI DALAM transaksi.

import mysql from "mysql2/promise";

// Tabel hasil perhitungan yang boleh dihapus (bisa dihitung ulang lewat tombol Hitung) kalau
// barisnya bentrok unik saat dipindah (mis. tukin_calculations employee_id+period).
const RECALCULABLE = new Set(["tukin_calculations", "meal_allowance_calculations"]);

export type MergeEmp = {
  id: string;
  name: string;
  nip: string | null;
  phone_number: string | null;
  status: string;
  role: string;
  finger_id: number | null;
  department: string | null;
};
// Kunci pencocokan nama: bagian sebelum koma pertama (gelar di belakang dibuang), gelar di depan
// (Prof, Dr, Drs, Dra, Ir, H, Hj) dibuang, huruf kecil, hanya huruf. "Andi"/"St." tetap (nama).
export function normPersonName(n: string): string {
  return n
    .split(",")[0]
    .replace(/\b(prof|dr|drs|dra|ir|h|hj)\b\.?/gi, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export type Fk = { table: string; column: string; deleteRule: string };

export async function loadEmployeeFks(db: mysql.Connection): Promise<Fk[]> {
  const [fkRows] = await db.query<any[]>(
    `SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, r.DELETE_RULE AS d
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.REFERENCED_TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'employees'
       AND k.REFERENCED_COLUMN_NAME = 'id'`,
  );
  return fkRows.map((r) => ({ table: r.t, column: r.c, deleteRule: r.d }));
}

export async function countReferences(db: mysql.Connection, fks: Fk[], employeeId: string): Promise<string[]> {
  const counts: string[] = [];
  for (const fk of fks) {
    const [[c]] = await db.query<any[]>(`SELECT COUNT(*) AS n FROM \`${fk.table}\` WHERE \`${fk.column}\` = ?`, [employeeId]);
    if (Number(c.n) > 0) counts.push(`${fk.table} ${c.n}`);
  }
  return counts;
}

// Pindahkan semua data donor ke keeper lalu hapus donor. Melempar error (caller rollback) bila
// ada data yang tidak bisa dipindah otomatis.
export async function mergeDonorsInto(db: mysql.Connection, fks: Fk[], keeper: MergeEmp, donors: MergeEmp[]) {
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
}
