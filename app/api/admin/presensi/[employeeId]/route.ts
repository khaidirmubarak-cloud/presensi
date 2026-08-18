import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, dbDatetimeToIso, toDbDatetime } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange } from "../../../../../lib/attendance-status";

export const dynamic = "force-dynamic";

type PingRow = { created_at: string; within_radius: number };
type ScanRow = { scanned_at: string };

// Riwayat presensi satu pegawai untuk satu bulan -- pelengkap /api/admin/presensi (yang
// menampilkan semua pegawai tapi cuma satu tanggal).
export async function GET(req: NextRequest, { params }: { params: { employeeId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const witaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const month = /^\d{4}-\d{2}$/.test(searchParams.get("month") ?? "")
    ? searchParams.get("month")!
    : witaToday.slice(0, 7);

  const employee = await queryOne<{
    id: string;
    name: string;
    nip: string | null;
    unit_name: string | null;
    uses_shift: number | null;
  }>(
    `SELECT e.id, e.name, e.nip, u.name AS unit_name, p.uses_shift
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN units u ON u.id = p.unit_id
     WHERE e.id = ?`,
    [params.employeeId],
  );
  if (!employee) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const start = toDbDatetime(new Date(`${month}-01T00:00:00+08:00`));
  const end = toDbDatetime(new Date(`${nextMonth}-01T00:00:00+08:00`));

  const [pingRows, scanRows, holidayRows, ramadhanPeriods, rules] = await Promise.all([
    query<PingRow>(
      "SELECT created_at, within_radius FROM attendance_pings WHERE employee_id = ? AND created_at >= ? AND created_at < ?",
      [employee.id, start, end],
    ),
    query<ScanRow>(
      `SELECT fs.scanned_at FROM fingerprint_scans fs
       JOIN employees e ON e.finger_id = fs.finger_id
       WHERE e.id = ? AND fs.scanned_at >= ? AND fs.scanned_at < ?`,
      [employee.id, start, end],
    ),
    query<{ holiday_date: string }>(
      "SELECT holiday_date FROM holidays WHERE holiday_date >= ? AND holiday_date < ?",
      [`${month}-01`, `${nextMonth}-01`],
    ),
    query<RamadhanRange>("SELECT start_date, end_date FROM ramadhan_periods"),
    query<WorkHourRule>("SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules"),
  ]);

  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));

  const pingsByDate = new Map<string, { created_at: string; within_radius: number }[]>();
  for (const r of pingRows) {
    const iso = dbDatetimeToIso(r.created_at)!;
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(iso));
    const list = pingsByDate.get(dateKey);
    const entry = { created_at: iso, within_radius: r.within_radius };
    if (list) list.push(entry);
    else pingsByDate.set(dateKey, [entry]);
  }

  const scansByDate = new Map<string, { scanned_at: string }[]>();
  for (const r of scanRows) {
    const iso = dbDatetimeToIso(r.scanned_at)!;
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(iso));
    const list = scansByDate.get(dateKey);
    const entry = { scanned_at: iso };
    if (list) list.push(entry);
    else scansByDate.set(dateKey, [entry]);
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const daily = computeDailyStatus(
      date,
      pingsByDate.get(date) ?? [],
      !!employee.uses_shift,
      holidayDates,
      ramadhanPeriods,
      rules,
      scansByDate.get(date) ?? [],
    );
    days.push({ date, ...daily });
  }
  days.reverse(); // terbaru dulu

  return NextResponse.json({
    employee: { id: employee.id, name: employee.name, nip: employee.nip, unitName: employee.unit_name },
    month,
    days,
  });
}
