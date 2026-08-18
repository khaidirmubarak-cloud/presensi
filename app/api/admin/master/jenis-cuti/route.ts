import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leaveTypes = await query(
    "SELECT id, name, tukin_deduction_percent, sort_order FROM leave_types ORDER BY sort_order, id",
  );
  return NextResponse.json({ leaveTypes });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const tukinDeductionPercent = Number(body?.tukin_deduction_percent) || 0;
  const sortOrder = Number(body?.sort_order) || 0;

  if (!id || !name) {
    return NextResponse.json({ error: "Kode dan nama jenis cuti wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM leave_types WHERE id = ?", [id]);
  if (existing) {
    return NextResponse.json({ error: "Kode jenis cuti ini sudah ada." }, { status: 409 });
  }

  await execute(
    "INSERT INTO leave_types (id, name, tukin_deduction_percent, sort_order) VALUES (?, ?, ?, ?)",
    [id, name, tukinDeductionPercent, sortOrder],
  );
  return NextResponse.json(
    { leaveType: { id, name, tukin_deduction_percent: tukinDeductionPercent, sort_order: sortOrder } },
    { status: 201 },
  );
}
