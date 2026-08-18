import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const units = await query("SELECT id, name, satker_id FROM units ORDER BY id");
  return NextResponse.json({ units });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const satkerId = typeof body?.satker_id === "string" && body.satker_id.trim() ? body.satker_id.trim() : null;

  if (!id || !name) {
    return NextResponse.json({ error: "ID dan nama unit wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM units WHERE id = ?", [id]);
  if (existing) {
    return NextResponse.json({ error: "ID unit ini sudah ada." }, { status: 409 });
  }

  await execute("INSERT INTO units (id, name, satker_id) VALUES (?, ?, ?)", [id, name, satkerId]);
  return NextResponse.json({ unit: { id, name, satker_id: satkerId } }, { status: 201 });
}
