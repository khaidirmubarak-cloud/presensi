import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Difilter per tahun (258+ baris dan terus bertambah tiap tahun -- tanpa filter tidak
// muat satu layar, beda dari tabel referensi Fase 1 yang cuma puluhan baris).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const holidays = await query(
    "SELECT id, holiday_date, description FROM holidays WHERE YEAR(holiday_date) = ? ORDER BY holiday_date",
    [year],
  );
  return NextResponse.json({ holidays, year });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const holidayDate = typeof body?.holiday_date === "string" ? body.holiday_date.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!holidayDate || !description) {
    return NextResponse.json({ error: "Tanggal dan keterangan wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM holidays WHERE holiday_date = ?", [holidayDate]);
  if (existing) {
    return NextResponse.json({ error: "Tanggal ini sudah terdaftar sebagai hari libur." }, { status: 409 });
  }

  const result = await execute("INSERT INTO holidays (holiday_date, description) VALUES (?, ?)", [
    holidayDate,
    description,
  ]);
  return NextResponse.json(
    { holiday: { id: result.insertId, holiday_date: holidayDate, description } },
    { status: 201 },
  );
}
