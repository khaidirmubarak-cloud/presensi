import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 50, 100];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const offset = (page - 1) * pageSize;

  const countRow = await queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM leave_types");
  const total = countRow?.total ?? 0;

  const leaveTypes = await query(
    "SELECT id, name, tukin_deduction_percent, counts_toward_meal_allowance, sort_order FROM leave_types ORDER BY sort_order, id LIMIT ? OFFSET ?",
    [pageSize, offset],
  );
  return NextResponse.json({ leaveTypes, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const tukinDeductionPercent = Number(body?.tukin_deduction_percent) || 0;
  const countsTowardMealAllowance = body?.counts_toward_meal_allowance ? 1 : 0;
  const sortOrder = Number(body?.sort_order) || 0;

  if (!id || !name) {
    return NextResponse.json({ error: "Kode dan nama jenis cuti wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM leave_types WHERE id = ?", [id]);
  if (existing) {
    return NextResponse.json({ error: "Kode jenis cuti ini sudah ada." }, { status: 409 });
  }

  await execute(
    "INSERT INTO leave_types (id, name, tukin_deduction_percent, counts_toward_meal_allowance, sort_order) VALUES (?, ?, ?, ?, ?)",
    [id, name, tukinDeductionPercent, countsTowardMealAllowance, sortOrder],
  );
  return NextResponse.json(
    {
      leaveType: {
        id,
        name,
        tukin_deduction_percent: tukinDeductionPercent,
        counts_toward_meal_allowance: countsTowardMealAllowance,
        sort_order: sortOrder,
      },
    },
    { status: 201 },
  );
}
