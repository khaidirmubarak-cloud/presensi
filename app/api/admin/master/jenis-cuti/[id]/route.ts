import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const tukinDeductionPercent = Number(body?.tukin_deduction_percent) || 0;
  const countsTowardMealAllowance = body?.counts_toward_meal_allowance ? 1 : 0;
  const sortOrder = Number(body?.sort_order) || 0;
  if (!name) {
    return NextResponse.json({ error: "Nama jenis cuti wajib diisi." }, { status: 400 });
  }

  const result = await execute(
    "UPDATE leave_types SET name = ?, tukin_deduction_percent = ?, counts_toward_meal_allowance = ?, sort_order = ? WHERE id = ?",
    [name, tukinDeductionPercent, countsTowardMealAllowance, sortOrder, params.id],
  );
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Jenis cuti tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await execute("DELETE FROM leave_types WHERE id = ?", [params.id]);
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Jenis cuti tidak ditemukan." }, { status: 404 });
    }
  } catch {
    return NextResponse.json(
      { error: "Gagal menghapus. Kemungkinan masih dipakai pengajuan cuti." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
