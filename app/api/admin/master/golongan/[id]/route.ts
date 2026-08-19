import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const mealAmount =
    body?.meal_amount === undefined || body?.meal_amount === null || body?.meal_amount === ""
      ? null
      : Number(body.meal_amount);
  const mealTaxPercent = Number(body?.meal_tax_percent) || 0;
  if (!code || !title) {
    return NextResponse.json({ error: "Kode dan nama pangkat wajib diisi." }, { status: 400 });
  }
  if (mealAmount !== null && (!Number.isFinite(mealAmount) || mealAmount < 0)) {
    return NextResponse.json({ error: "Nominal uang makan tidak valid." }, { status: 400 });
  }

  const result = await execute("UPDATE ranks SET code = ?, title = ?, meal_amount = ?, meal_tax_percent = ? WHERE id = ?", [
    code,
    title,
    mealAmount,
    mealTaxPercent,
    params.id,
  ]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Golongan tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await execute("DELETE FROM ranks WHERE id = ?", [params.id]);
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Golongan tidak ditemukan." }, { status: 404 });
    }
  } catch {
    return NextResponse.json(
      { error: "Gagal menghapus. Kemungkinan masih dipakai pegawai." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
