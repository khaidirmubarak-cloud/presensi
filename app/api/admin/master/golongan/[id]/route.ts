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
  if (!code || !title) {
    return NextResponse.json({ error: "Kode dan nama pangkat wajib diisi." }, { status: 400 });
  }

  const result = await execute("UPDATE ranks SET code = ?, title = ? WHERE id = ?", [
    code,
    title,
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
