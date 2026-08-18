import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = ["pengajuan", "disetujui", "ditolak"];

// PATCH dipakai untuk Setujui/Tolak (kirim cuma { status }) maupun edit penuh.
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

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
    }
    fields.push("status = ?");
    values.push(body.status);
  }
  if (body.leave_type_id !== undefined) {
    fields.push("leave_type_id = ?");
    values.push(String(body.leave_type_id).trim());
  }
  if (body.start_date !== undefined) {
    fields.push("start_date = ?");
    values.push(String(body.start_date).trim());
  }
  if (body.end_date !== undefined) {
    fields.push("end_date = ?");
    values.push(String(body.end_date).trim());
  }
  if (body.reason !== undefined) {
    fields.push("reason = ?");
    values.push(String(body.reason).trim() || null);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
  }

  const result = await execute(
    `UPDATE leave_requests SET ${fields.join(", ")} WHERE id = ?`,
    [...values, params.id],
  );
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Pengajuan cuti tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM leave_requests WHERE id = ?", [params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Pengajuan cuti tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
