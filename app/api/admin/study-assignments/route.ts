import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPE = ["tube1", "tube2"];
const ALLOWED_STATUS = ["aktif", "selesai"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";

  const where = q ? "WHERE e.name LIKE ? OR e.nip LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`] : [];

  const assignments = await query(
    `SELECT sa.id, sa.employee_id, e.name AS employee_name, e.nip AS employee_nip,
            sa.type, sa.start_date, sa.status
     FROM study_assignments sa
     JOIN employees e ON e.id = sa.employee_id
     ${where}
     ORDER BY sa.status = 'aktif' DESC, sa.start_date DESC, sa.id DESC`,
    params,
  );

  return NextResponse.json({ assignments });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const employeeId = typeof body?.employee_id === "string" ? body.employee_id.trim() : "";
  const type = ALLOWED_TYPE.includes(body?.type) ? body.type : "";
  const startDate = typeof body?.start_date === "string" ? body.start_date.trim() : "";
  const status = ALLOWED_STATUS.includes(body?.status) ? body.status : "aktif";

  if (!employeeId || !type) {
    return NextResponse.json({ error: "Pegawai dan jenis tugas belajar wajib diisi." }, { status: 400 });
  }

  const employee = await queryOne("SELECT id FROM employees WHERE id = ?", [employeeId]);
  if (!employee) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  const result = await execute(
    "INSERT INTO study_assignments (employee_id, type, start_date, status) VALUES (?, ?, ?, ?)",
    [employeeId, type, startDate || null, status],
  );

  return NextResponse.json({ assignment: { id: result.insertId } }, { status: 201 });
}
