import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../../../lib/db";
import { listLoginEmails } from "../../../../../../lib/login-emails";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Email login pegawai (tabel employee_login_emails, dibuat oleh dashboard-kinerja/sql/003).
// Dipakai dashboard-kinerja untuk "Masuk dengan Google": email Google dicocokkan ke sini.
// Sumber otomatis: login SIAKAD (sevima_login) dan sync Sevima (sevima_email/_kampus);
// admin bisa menambah manual (source 'admin') untuk pegawai yang emailnya tidak tercatat di
// Sevima dan tidak tahu password SIAKAD. Satu email hanya boleh milik satu pegawai (PK email).

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ emails: await listLoginEmails(params.id) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) {
    return NextResponse.json({ error: "Alamat email tidak valid." }, { status: 400 });
  }

  const employee = await queryOne<{ id: string }>("SELECT id FROM employees WHERE id = ?", [params.id]);
  if (!employee) return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });

  const owner = await queryOne<{ employee_id: string; name: string; nip: string | null }>(
    `SELECT le.employee_id, e.name, e.nip FROM employee_login_emails le
     JOIN employees e ON e.id = le.employee_id WHERE le.email = ?`,
    [email],
  );
  if (owner) {
    if (owner.employee_id === params.id) {
      return NextResponse.json({ error: "Email ini sudah terdaftar untuk pegawai ini." }, { status: 409 });
    }
    return NextResponse.json(
      {
        error: `Email ini sudah terhubung ke ${owner.name}${owner.nip ? ` (NIP ${owner.nip})` : ""}. Hapus dulu dari pegawai tersebut bila memang salah.`,
      },
      { status: 409 },
    );
  }

  try {
    await execute("INSERT INTO employee_login_emails (email, employee_id, source) VALUES (?, ?, 'admin')", [email, params.id]);
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan email (mungkin baru saja dipakai pegawai lain)." }, { status: 409 });
  }
  return NextResponse.json({ emails: await listLoginEmails(params.id) }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Parameter email wajib diisi." }, { status: 400 });

  const result = await execute("DELETE FROM employee_login_emails WHERE email = ? AND employee_id = ?", [email, params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Email tidak ditemukan pada pegawai ini." }, { status: 404 });
  }
  return NextResponse.json({ emails: await listLoginEmails(params.id) });
}
