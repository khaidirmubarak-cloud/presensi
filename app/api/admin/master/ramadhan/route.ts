import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const periods = await query(
    "SELECT year, start_date, end_date FROM ramadhan_periods ORDER BY year DESC",
  );
  return NextResponse.json({ periods });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const startDate = typeof body?.start_date === "string" ? body.start_date.trim() : "";
  const endDate = typeof body?.end_date === "string" ? body.end_date.trim() : "";

  if (!year || !startDate || !endDate) {
    return NextResponse.json({ error: "Tahun, tanggal mulai, dan tanggal selesai wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT year FROM ramadhan_periods WHERE year = ?", [year]);
  if (existing) {
    return NextResponse.json({ error: "Periode Ramadhan untuk tahun ini sudah ada." }, { status: 409 });
  }

  await execute("INSERT INTO ramadhan_periods (year, start_date, end_date) VALUES (?, ?, ?)", [
    year,
    startDate,
    endDate,
  ]);
  return NextResponse.json({ period: { year, start_date: startDate, end_date: endDate } }, { status: 201 });
}
