import { query, dbDatetimeToIso } from "./db";

// Email login pegawai (tabel employee_login_emails, dibuat oleh dashboard-kinerja/sql/003) --
// dipakai "Masuk dengan Google" di dashboard-kinerja. Dikelola admin lewat
// app/api/admin/pegawai/[id]/emails.

export type LoginEmail = { email: string; source: string; createdAt: string | null; lastLoginAt: string | null };

export async function listLoginEmails(employeeId: string): Promise<LoginEmail[]> {
  const rows = await query<{ email: string; source: string; created_at: string; last_login_at: string | null }>(
    "SELECT email, source, created_at, last_login_at FROM employee_login_emails WHERE employee_id = ? ORDER BY created_at",
    [employeeId],
  );
  return rows.map((r) => ({
    email: r.email,
    source: r.source,
    createdAt: dbDatetimeToIso(r.created_at),
    lastLoginAt: dbDatetimeToIso(r.last_login_at),
  }));
}
