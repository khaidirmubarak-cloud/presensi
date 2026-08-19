import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const grades = await query("SELECT id, name, base_amount FROM tukin_nonpns_grades ORDER BY id");
  return NextResponse.json({ grades });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = Number.isFinite(Number(body?.id)) ? Number(body.id) : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const baseAmount =
    body?.base_amount === undefined || body?.base_amount === null || body?.base_amount === ""
      ? null
      : Number(body.base_amount);

  if (id === null || !name) {
    return NextResponse.json({ error: "ID grade dan nama wajib diisi." }, { status: 400 });
  }
  if (baseAmount !== null && (!Number.isFinite(baseAmount) || baseAmount < 0)) {
    return NextResponse.json({ error: "Nominal tukin tidak valid." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM tukin_nonpns_grades WHERE id = ?", [id]);
  if (existing) {
    return NextResponse.json({ error: "ID grade ini sudah ada." }, { status: 409 });
  }

  await execute("INSERT INTO tukin_nonpns_grades (id, name, base_amount) VALUES (?, ?, ?)", [id, name, baseAmount]);
  return NextResponse.json({ grade: { id, name, base_amount: baseAmount } }, { status: 201 });
}
