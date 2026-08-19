import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const years = Number(body?.years);
  const nominal = Number(body?.nominal);

  if (!Number.isFinite(years) || years < 0) {
    return NextResponse.json({ error: "Masa kerja (tahun) tidak valid." }, { status: 400 });
  }
  if (!Number.isFinite(nominal) || nominal < 0) {
    return NextResponse.json({ error: "Nominal tidak valid." }, { status: 400 });
  }

  const result = await execute("UPDATE salary_scales SET years = ?, nominal = ? WHERE id = ?", [
    years,
    nominal,
    params.id,
  ]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Data gaji pokok tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM salary_scales WHERE id = ?", [params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Data gaji pokok tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
