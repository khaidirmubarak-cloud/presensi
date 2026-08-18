import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 50, 100];
const ALLOWED_STATUS = ["pengajuan", "disetujui", "ditolak"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const status = ALLOWED_STATUS.includes(searchParams.get("status") ?? "") ? searchParams.get("status") : "";
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: any[] = [];
  if (q) {
    conditions.push("(e.name LIKE ? OR e.nip LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    conditions.push("lr.status = ?");
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id ${where}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const requests = await query(
    `SELECT lr.id, lr.employee_id, e.name AS employee_name, e.nip AS employee_nip,
            lr.leave_type_id, lt.name AS leave_type_name,
            lr.start_date, lr.end_date, lr.reason, lr.status
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     ${where}
     ORDER BY lr.start_date DESC, lr.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return NextResponse.json({ requests, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const employeeId = typeof body?.employee_id === "string" ? body.employee_id.trim() : "";
  const leaveTypeId = typeof body?.leave_type_id === "string" ? body.leave_type_id.trim() : "";
  const startDate = typeof body?.start_date === "string" ? body.start_date.trim() : "";
  const endDate = typeof body?.end_date === "string" ? body.end_date.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const status = ALLOWED_STATUS.includes(body?.status) ? body.status : "disetujui";

  if (!employeeId || !leaveTypeId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Pegawai, jenis cuti, tanggal mulai, dan tanggal selesai wajib diisi." },
      { status: 400 },
    );
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: "Tanggal mulai tidak boleh setelah tanggal selesai." }, { status: 400 });
  }

  const employee = await queryOne("SELECT id FROM employees WHERE id = ?", [employeeId]);
  if (!employee) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }
  const leaveType = await queryOne("SELECT id FROM leave_types WHERE id = ?", [leaveTypeId]);
  if (!leaveType) {
    return NextResponse.json({ error: "Jenis cuti tidak ditemukan." }, { status: 404 });
  }

  const result = await execute(
    `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [employeeId, leaveTypeId, startDate, endDate, reason || null, status],
  );

  return NextResponse.json({ leaveRequest: { id: result.insertId } }, { status: 201 });
}
