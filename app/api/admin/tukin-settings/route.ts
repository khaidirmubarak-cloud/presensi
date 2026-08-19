import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Baris tunggal (id selalu 1) -- persentase potongan tukin untuk hari kerja tanpa data
// presensi sama sekali dan tanpa cuti disetujui ("alpa"). Diseed lewat sql/007.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await queryOne("SELECT alpa_deduction_percent FROM tukin_settings WHERE id = 1");
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const percent = Number(body?.alpa_deduction_percent);
  if (!Number.isFinite(percent) || percent < 0) {
    return NextResponse.json({ error: "Persentase tidak valid." }, { status: 400 });
  }

  await execute("UPDATE tukin_settings SET alpa_deduction_percent = ? WHERE id = 1", [percent]);
  return NextResponse.json({ ok: true });
}
