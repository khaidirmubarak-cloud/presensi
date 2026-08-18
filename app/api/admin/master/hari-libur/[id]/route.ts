import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const holidayDate = typeof body?.holiday_date === "string" ? body.holiday_date.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!holidayDate || !description) {
    return NextResponse.json({ error: "Tanggal dan keterangan wajib diisi." }, { status: 400 });
  }

  try {
    const result = await execute(
      "UPDATE holidays SET holiday_date = ?, description = ? WHERE id = ?",
      [holidayDate, description, params.id],
    );
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Hari libur tidak ditemukan." }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Tanggal ini sudah terdaftar sebagai hari libur." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM holidays WHERE id = ?", [params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Hari libur tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
