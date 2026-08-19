import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, dbDatetimeToIso, toDbDatetime, execute } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange } from "../../../../lib/attendance-status";
import { isEligibleMealDay } from "../../../../lib/uang-makan";

export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 50, 100];

type EmployeeRow = {
  id: string;
  name: string;
  nip: string | null;
  uses_shift: number | null;
  rank_code: string | null;
  meal_amount: string | null;
  meal_tax_percent: string | null;
};

type PingRow = { employee_id: string; created_at: string; within_radius: number };
type ScanRow = { employee_id: string; scanned_at: string };
type LeaveRow = { employee_id: string; leave_type_id: string; leave_type_name: string; start_date: string; end_date: string };

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { y, m, nextMonth, start: toDbDatetime(new Date(`${month}-01T00:00:00+08:00`)), end: toDbDatetime(new Date(`${nextMonth}-01T00:00:00+08:00`)) };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const witaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const period = /^\d{4}-\d{2}$/.test(searchParams.get("period") ?? "")
    ? (searchParams.get("period") as string)
    : witaToday.slice(0, 7);
  const q = searchParams.get("q")?.trim() || "";

  const where = q ? "AND (e.name LIKE ? OR e.nip LIKE ?)" : "";
  const params = q ? [period, `%${q}%`, `%${q}%`] : [period];
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const offset = (page - 1) * pageSize;

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM meal_allowance_calculations mac JOIN employees e ON e.id = mac.employee_id WHERE mac.period = ? ${where}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const rows = await query(
    `SELECT mac.employee_id, e.name, e.nip, r.code AS rank_code,
            mac.eligible_days, mac.rate_amount, mac.tax_percent, mac.gross_amount, mac.net_amount, mac.calculated_at
     FROM meal_allowance_calculations mac
     JOIN employees e ON e.id = mac.employee_id
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN ranks r ON r.id = p.rank_id
     WHERE mac.period = ? ${where}
     ORDER BY e.name
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return NextResponse.json({ period, calculations: rows, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const period = typeof body?.period === "string" && /^\d{4}-\d{2}$/.test(body.period) ? body.period : "";
  if (!period) {
    return NextResponse.json({ error: "Parameter period (YYYY-MM) wajib diisi." }, { status: 400 });
  }

  const { y, m, nextMonth, start, end } = monthRange(period);

  const [holidayRows, ramadhanPeriods, rules, leaveTypeRows] = await Promise.all([
    query<{ holiday_date: string }>("SELECT holiday_date FROM holidays WHERE holiday_date >= ? AND holiday_date < ?", [
      `${period}-01`,
      `${nextMonth}-01`,
    ]),
    query<RamadhanRange>("SELECT start_date, end_date FROM ramadhan_periods"),
    query<WorkHourRule>("SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules"),
    query<{ id: string; counts_toward_meal_allowance: number }>("SELECT id, counts_toward_meal_allowance FROM leave_types"),
  ]);
  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));
  const mealLeaveTypeIds = new Set(leaveTypeRows.filter((r) => r.counts_toward_meal_allowance).map((r) => r.id));

  const employees = await query<EmployeeRow>(
    `SELECT e.id, e.name, e.nip, p.uses_shift, r.code AS rank_code, r.meal_amount, r.meal_tax_percent
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN ranks r ON r.id = p.rank_id
     WHERE (p.employment_status IS NULL OR p.employment_status = 'aktif')
       AND (p.gets_meal_allowance IS NULL OR p.gets_meal_allowance = 1)`,
  );

  const [pingRows, scanRows, leaveRows] = await Promise.all([
    query<PingRow>("SELECT employee_id, created_at, within_radius FROM attendance_pings WHERE created_at >= ? AND created_at < ?", [
      start,
      end,
    ]),
    query<ScanRow>(
      `SELECT e.id AS employee_id, fs.scanned_at FROM fingerprint_scans fs
       JOIN employees e ON e.finger_id = fs.finger_id
       WHERE fs.scanned_at >= ? AND fs.scanned_at < ?`,
      [start, end],
    ),
    query<LeaveRow>(
      `SELECT lr.employee_id, lt.id AS leave_type_id, lt.name AS leave_type_name, lr.start_date, lr.end_date
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.status = 'disetujui' AND lr.start_date < ? AND lr.end_date >= ?`,
      [`${nextMonth}-01`, `${period}-01`],
    ),
  ]);

  const pingsByEmployee = new Map<string, PingRow[]>();
  for (const p of pingRows) {
    const list = pingsByEmployee.get(p.employee_id);
    if (list) list.push(p);
    else pingsByEmployee.set(p.employee_id, [p]);
  }
  const scansByEmployee = new Map<string, ScanRow[]>();
  for (const s of scanRows) {
    const list = scansByEmployee.get(s.employee_id);
    if (list) list.push(s);
    else scansByEmployee.set(s.employee_id, [s]);
  }
  const leaveByEmployee = new Map<string, LeaveRow[]>();
  for (const l of leaveRows) {
    const list = leaveByEmployee.get(l.employee_id);
    if (list) list.push(l);
    else leaveByEmployee.set(l.employee_id, [l]);
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dateKeys: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) dateKeys.push(`${period}-${String(day).padStart(2, "0")}`);

  const skipped: { employeeId: string; name: string; reason: string }[] = [];
  const results: {
    employeeId: string;
    eligibleDays: number;
    rateAmount: number;
    taxPercent: number;
    grossAmount: number;
    netAmount: number;
  }[] = [];

  for (const e of employees) {
    if (e.uses_shift) {
      skipped.push({ employeeId: e.id, name: e.name, reason: "Pegawai shift -- belum dihitung otomatis" });
      continue;
    }
    if (e.meal_amount === null) {
      skipped.push({ employeeId: e.id, name: e.name, reason: "Belum ada nominal uang makan (golongan)" });
      continue;
    }

    const pings = (pingsByEmployee.get(e.id) ?? []).map((p) => ({
      created_at: dbDatetimeToIso(p.created_at)!,
      within_radius: p.within_radius,
    }));
    const scans = (scansByEmployee.get(e.id) ?? []).map((s) => ({ scanned_at: dbDatetimeToIso(s.scanned_at)! }));
    const leaves = leaveByEmployee.get(e.id) ?? [];

    const pingsByDate = new Map<string, typeof pings>();
    for (const p of pings) {
      const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(p.created_at));
      const list = pingsByDate.get(dateKey);
      if (list) list.push(p);
      else pingsByDate.set(dateKey, [p]);
    }
    const scansByDate = new Map<string, typeof scans>();
    for (const s of scans) {
      const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(s.scanned_at));
      const list = scansByDate.get(dateKey);
      if (list) list.push(s);
      else scansByDate.set(dateKey, [s]);
    }

    let eligibleDays = 0;
    for (const date of dateKeys) {
      const leave = leaves.find((l) => date >= l.start_date && date <= l.end_date);
      const daily = computeDailyStatus(
        date,
        pingsByDate.get(date) ?? [],
        false,
        holidayDates,
        ramadhanPeriods,
        rules,
        scansByDate.get(date) ?? [],
        leave ? { id: leave.leave_type_id, name: leave.leave_type_name } : null,
      );
      if (isEligibleMealDay(daily, mealLeaveTypeIds)) eligibleDays++;
    }

    const rateAmount = Number(e.meal_amount);
    const taxPercent = Number(e.meal_tax_percent ?? 0);
    const grossAmount = eligibleDays * rateAmount;
    const netAmount = Math.round(grossAmount * (1 - taxPercent / 100));

    results.push({ employeeId: e.id, eligibleDays, rateAmount, taxPercent, grossAmount, netAmount });
  }

  const BATCH_SIZE = 200;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = batch.flatMap((r) => [
      r.employeeId,
      period,
      r.eligibleDays,
      r.rateAmount,
      r.taxPercent,
      r.grossAmount,
      r.netAmount,
    ]);
    await execute(
      `INSERT INTO meal_allowance_calculations (employee_id, period, eligible_days, rate_amount, tax_percent, gross_amount, net_amount)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         eligible_days = VALUES(eligible_days), rate_amount = VALUES(rate_amount), tax_percent = VALUES(tax_percent),
         gross_amount = VALUES(gross_amount), net_amount = VALUES(net_amount), calculated_at = CURRENT_TIMESTAMP`,
      values,
    );
  }

  return NextResponse.json({ period, calculated: results.length, skipped });
}
