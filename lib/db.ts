import mysql from "mysql2/promise";

// Koneksi baru per query (bukan pool) -- sama seperti dashboard-kinerja. Kedua aplikasi
// memakai database MariaDB yang sama, jadi pola koneksinya disamakan sengaja: pool yang
// hidup lama di proses Next.js standalone pernah macet di snapshot data basi di host
// cPanel ini (lihat catatan yang sama di dashboard-kinerja/lib/db.ts).
async function getConnection(): Promise<mysql.Connection> {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
  });
  await connection.query("SET time_zone = '+00:00'");
  return connection;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const connection = await getConnection();
  try {
    const [rows] = await connection.query(sql, params);
    return rows as T[];
  } finally {
    await connection.end();
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params: any[] = [],
): Promise<{ affectedRows: number; insertId: number }> {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute<mysql.ResultSetHeader>(sql, params);
    return { affectedRows: result.affectedRows, insertId: result.insertId };
  } finally {
    await connection.end();
  }
}

// Sama seperti dashboard-kinerja/lib/db.ts: semua DATETIME ditulis sebagai UTC oleh kode
// aplikasi, driver mengembalikannya sebagai string polos (dateStrings: true) supaya
// round-trip UTC tidak digeser jam lokal browser.
export function dbDatetimeToIso(value: string | null): string | null {
  if (!value) return null;
  return `${value.replace(" ", "T")}.000Z`;
}

export function toDbDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function nowDbDatetime(): string {
  return toDbDatetime(new Date());
}
