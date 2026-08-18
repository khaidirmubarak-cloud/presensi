import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const checkIn = typeof body?.check_in_time === "string" ? body.check_in_time.trim() : "";
  const checkOut = typeof body?.check_out_time === "string" ? body.check_out_time.trim() : "";
  if (!checkIn || !checkOut) {
    return NextResponse.json({ error: "Jam masuk dan jam pulang wajib diisi." }, { status: 400 });
  }

  const result = await execute(
    "UPDATE work_hour_rules SET check_in_time = ?, check_out_time = ? WHERE id = ?",
    [checkIn, checkOut, params.id],
  );
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Aturan jam kerja tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
