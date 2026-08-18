import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Tabel referensi kecil (~20 baris) -- tanpa pagination, list+create+edit sederhana.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ranks = await query("SELECT id, code, title FROM ranks ORDER BY id");
  return NextResponse.json({ ranks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!id || !code || !title) {
    return NextResponse.json({ error: "ID, kode, dan nama pangkat wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM ranks WHERE id = ?", [id]);
  if (existing) {
    return NextResponse.json({ error: "ID golongan ini sudah ada." }, { status: 409 });
  }

  await execute("INSERT INTO ranks (id, code, title) VALUES (?, ?, ?)", [id, code, title]);
  return NextResponse.json({ rank: { id, code, title } }, { status: 201 });
}
