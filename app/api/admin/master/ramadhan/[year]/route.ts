import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { year: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const startDate = typeof body?.start_date === "string" ? body.start_date.trim() : "";
  const endDate = typeof body?.end_date === "string" ? body.end_date.trim() : "";
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Tanggal mulai dan tanggal selesai wajib diisi." }, { status: 400 });
  }

  const result = await execute(
    "UPDATE ramadhan_periods SET start_date = ?, end_date = ? WHERE year = ?",
    [startDate, endDate, params.year],
  );
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Periode Ramadhan tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { year: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM ramadhan_periods WHERE year = ?", [params.year]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Periode Ramadhan tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
