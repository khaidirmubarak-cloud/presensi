import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPE = ["tube1", "tube2"];
const ALLOWED_STATUS = ["aktif", "selesai"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (body.type !== undefined) {
    if (!ALLOWED_TYPE.includes(body.type)) {
      return NextResponse.json({ error: "Jenis tugas belajar tidak valid." }, { status: 400 });
    }
    fields.push("type = ?");
    values.push(body.type);
  }
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
    }
    fields.push("status = ?");
    values.push(body.status);
  }
  if (body.start_date !== undefined) {
    fields.push("start_date = ?");
    values.push(String(body.start_date).trim() || null);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
  }

  const result = await execute(`UPDATE study_assignments SET ${fields.join(", ")} WHERE id = ?`, [
    ...values,
    params.id,
  ]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Data tugas belajar tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM study_assignments WHERE id = ?", [params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Data tugas belajar tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
