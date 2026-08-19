import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const maxMinutes =
    body?.max_minutes === undefined || body?.max_minutes === null || body?.max_minutes === ""
      ? null
      : Number(body.max_minutes);
  const percent = Number(body?.percent);

  if (!Number.isFinite(percent) || percent < 0) {
    return NextResponse.json({ error: "Persentase tidak valid." }, { status: 400 });
  }
  if (maxMinutes !== null && (!Number.isFinite(maxMinutes) || maxMinutes < 0)) {
    return NextResponse.json({ error: "Batas menit tidak valid." }, { status: 400 });
  }

  const result = await execute("UPDATE tukin_deduction_tiers SET max_minutes = ?, percent = ? WHERE id = ?", [
    maxMinutes,
    percent,
    params.id,
  ]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Tier tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
