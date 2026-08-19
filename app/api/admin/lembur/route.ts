import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

type OvertimeEventRow = {
  id: number;
  event_date: string;
  hours: string;
  purpose: string | null;
};

type ParticipantRow = {
  overtime_event_id: number;
  employee_id: string;
  name: string;
  nip: string | null;
};

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const witaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
    ? (searchParams.get("month") as string)
    : witaToday.slice(0, 7);
  const q = searchParams.get("q")?.trim() || "";
  const { start, end } = monthRange(month);

  const conditions = ["oe.event_date BETWEEN ? AND ?"];
  const params: any[] = [start, end];
  if (q) {
    conditions.push(
      "oe.id IN (SELECT op.overtime_event_id FROM overtime_participants op JOIN employees e ON e.id = op.employee_id WHERE e.name LIKE ? OR e.nip LIKE ?)",
    );
    params.push(`%${q}%`, `%${q}%`);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const events = await query<OvertimeEventRow>(
    `SELECT oe.id, oe.event_date, oe.hours, oe.purpose
     FROM overtime_events oe
     ${where}
     ORDER BY oe.event_date DESC, oe.id DESC`,
    params,
  );

  const eventIds = events.map((e) => e.id);
  let participantsByEvent = new Map<number, { employee_id: string; name: string; nip: string | null }[]>();
  if (eventIds.length > 0) {
    const placeholders = eventIds.map(() => "?").join(", ");
    const participants = await query<ParticipantRow>(
      `SELECT op.overtime_event_id, op.employee_id, e.name, e.nip
       FROM overtime_participants op
       JOIN employees e ON e.id = op.employee_id
       WHERE op.overtime_event_id IN (${placeholders})
       ORDER BY e.name`,
      eventIds,
    );
    participantsByEvent = new Map();
    for (const p of participants) {
      const list = participantsByEvent.get(p.overtime_event_id) ?? [];
      list.push({ employee_id: p.employee_id, name: p.name, nip: p.nip });
      participantsByEvent.set(p.overtime_event_id, list);
    }
  }

  const result = events.map((e) => ({
    ...e,
    participants: participantsByEvent.get(e.id) ?? [],
  }));

  return NextResponse.json({ events: result, month });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const eventDate = typeof body?.event_date === "string" ? body.event_date.trim() : "";
  const hours = Number(body?.hours);
  const purpose = typeof body?.purpose === "string" ? body.purpose.trim() : "";
  const employeeIds: string[] = Array.isArray(body?.employee_ids)
    ? body.employee_ids.filter((v: unknown) => typeof v === "string")
    : [];

  if (!eventDate || !Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "Tanggal dan jumlah jam (lebih dari 0) wajib diisi." }, { status: 400 });
  }
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

  const result = await execute(
    "INSERT INTO overtime_events (event_date, hours, purpose) VALUES (?, ?, ?)",
    [eventDate, hours, purpose || null],
  );

  const rows = employeeIds.map((id) => [result.insertId, id]);
  const valuePlaceholders = rows.map(() => "(?, ?)").join(", ");
  await execute(
    `INSERT INTO overtime_participants (overtime_event_id, employee_id) VALUES ${valuePlaceholders}`,
    rows.flat(),
  );

  return NextResponse.json({ overtimeEvent: { id: result.insertId } }, { status: 201 });
}
