import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { countWorkingDays } from "../../../../../lib/calendar";

export const dynamic = "force-dynamic";

// Pengganti fungsional harikerja/harikerja.php lama (entri manual) -- dihitung otomatis
// dari holidays + akhir pekan, lihat lib/calendar.ts.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month")); // 1-12

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Parameter year dan month wajib diisi." }, { status: 400 });
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // hari terakhir bulan itu

  const holidays = await query<{ holiday_date: string }>(
    "SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?",
    [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
  );
  const holidayDates = new Set(holidays.map((h) => h.holiday_date));

  const workingDays = countWorkingDays(start, end, holidayDates);
  return NextResponse.json({ year, month, workingDays });
}
