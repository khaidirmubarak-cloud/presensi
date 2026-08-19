import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

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

  if (body.event_date !== undefined) {
    fields.push("event_date = ?");
    values.push(String(body.event_date).trim());
  }
  if (body.hours !== undefined) {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json({ error: "Jumlah jam harus lebih dari 0." }, { status: 400 });
    }
    fields.push("hours = ?");
    values.push(hours);
  }
  if (body.purpose !== undefined) {
    fields.push("purpose = ?");
    values.push(String(body.purpose).trim() || null);
  }

  const updatingEmployees = body.employee_ids !== undefined;
  const employeeIds: string[] = updatingEmployees
    ? (Array.isArray(body.employee_ids) ? body.employee_ids.filter((v: unknown) => typeof v === "string") : [])
    : [];

  if (updatingEmployees) {
    if (employeeIds.length === 0) {
      return NextResponse.json({ error: "Pilih minimal satu pegawai." }, { status: 400 });
    }
    const placeholders = employeeIds.map(() => "?").join(", ");
    const validEmployees = await query<{ id: string }>(
      `SELECT id FROM employees WHERE id IN (${placeholders})`,
      employeeIds,
    );
    if (validEmployees.length !== employeeIds.length) {
      return NextResponse.json({ error: "Ada pegawai yang tidak ditemukan." }, { status: 404 });
    }
  }

  if (fields.length === 0 && !updatingEmployees) {
    return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
  }

  if (fields.length > 0) {
    const result = await execute(`UPDATE overtime_events SET ${fields.join(", ")} WHERE id = ?`, [
      ...values,
      params.id,
    ]);
    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Data lembur tidak ditemukan." }, { status: 404 });
    }
  }

  if (updatingEmployees) {
    await execute("DELETE FROM overtime_participants WHERE overtime_event_id = ?", [params.id]);
    const rows = employeeIds.map((id) => [params.id, id]);
    const valuePlaceholders = rows.map(() => "(?, ?)").join(", ");
    await execute(
      `INSERT INTO overtime_participants (overtime_event_id, employee_id) VALUES ${valuePlaceholders}`,
      rows.flat(),
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM overtime_events WHERE id = ?", [params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Data lembur tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
