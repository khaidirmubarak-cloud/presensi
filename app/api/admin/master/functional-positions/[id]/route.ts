import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const jobClassId = Number.isFinite(Number(body?.job_class_id)) ? Number(body.job_class_id) : null;
  if (!name) return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });

  const result = await execute(
    "UPDATE functional_positions SET name = ?, job_class_id = ? WHERE id = ?",
    [name, jobClassId, params.id],
  );
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Jabatan fungsional tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await execute("DELETE FROM functional_positions WHERE id = ?", [params.id]);
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Jabatan fungsional tidak ditemukan." }, { status: 404 });
    }
  } catch {
    return NextResponse.json(
      { error: "Gagal menghapus. Kemungkinan masih dipakai pegawai." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
