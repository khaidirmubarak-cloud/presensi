import { NextRequest, NextResponse } from "next/server";
import { query, dbDatetimeToIso, toDbDatetime } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange } from "../../../../../lib/attendance-status";
import {
  buildAttendanceGridPdf,
  buildAttendanceGridExcel,
  type ExportEmployee,
  type ExportDay,
  type UnitGroup,
  type HolidayInfo,
  type LeaveTypeInfo,
} from "../../../../../lib/presensi-export";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  name: string;
  nip: string | null;
  unit_name: string | null;
  uses_shift: number | null;
  rank_code: string | null;
};

// Cetak rekap presensi 1 bulan untuk banyak pegawai sekaligus (PDF/Excel) -- bulk-fetch +
// computeDailyStatus yang sama seperti app/api/admin/tukin/route.ts (POST) dan
// app/api/admin/presensi/[employeeId]/route.ts, cuma digabung untuk N pegawai x 1 bulan.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const month = typeof body?.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : "";
  const format = body?.format === "pdf" || body?.format === "excel" ? body.format : "";
  if (!month || !format) {
    return NextResponse.json({ error: "Parameter month (YYYY-MM) dan format wajib diisi." }, { status: 400 });
  }
  const employeeIds: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds.filter((id: unknown) => typeof id === "string") : [];
  const q = typeof body?.q === "string" ? body.q.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";

  let employees: EmployeeRow[];
  if (employeeIds.length > 0) {
    employees = await query<EmployeeRow>(
      `SELECT e.id, e.name, e.nip, u.name AS unit_name, p.uses_shift, r.code AS rank_code
       FROM employees e
       LEFT JOIN employee_profiles p ON p.employee_id = e.id
       LEFT JOIN units u ON u.id = p.unit_id
       LEFT JOIN ranks r ON r.id = p.rank_id
       WHERE e.id IN (${employeeIds.map(() => "?").join(",")})
       ORDER BY u.name, e.name`,
      employeeIds,
    );
  } else {
    const conditions: string[] = [];
    const params: string[] = [];
    if (q) {
      conditions.push("(e.name LIKE ? OR e.nip LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      conditions.push("p.employee_category = ?");
      params.push(category);
    }
    if (unitId) {
      conditions.push("p.unit_id = ?");
      params.push(unitId);
    }
    const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
    employees = await query<EmployeeRow>(
      `SELECT e.id, e.name, e.nip, u.name AS unit_name, p.uses_shift, r.code AS rank_code
       FROM employees e
       LEFT JOIN employee_profiles p ON p.employee_id = e.id
       LEFT JOIN units u ON u.id = p.unit_id
       LEFT JOIN ranks r ON r.id = p.rank_id
       WHERE (p.employment_status IS NULL OR p.employment_status = 'aktif') ${where}
       ORDER BY u.name, e.name`,
      params,
    );
  }

  if (employees.length === 0) {
    return NextResponse.json({ error: "Tidak ada pegawai yang cocok untuk dicetak." }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const start = toDbDatetime(new Date(`${month}-01T00:00:00+08:00`));
  const end = toDbDatetime(new Date(`${nextMonth}-01T00:00:00+08:00`));
  const ids = employees.map((e) => e.id);
  const idPlaceholders = ids.map(() => "?").join(",");

  const [pingRows, scanRows, holidayRows, ramadhanPeriods, rules, leaveRows, cutiTypes] = await Promise.all([
    query<{ employee_id: string; created_at: string; within_radius: number }>(
      `SELECT employee_id, created_at, within_radius FROM attendance_pings
       WHERE employee_id IN (${idPlaceholders}) AND created_at >= ? AND created_at < ?`,
      [...ids, start, end],
    ),
    query<{ employee_id: string; scanned_at: string }>(
      `SELECT e.id AS employee_id, fs.scanned_at FROM fingerprint_scans fs
       JOIN employees e ON e.finger_id = fs.finger_id
       WHERE e.id IN (${idPlaceholders}) AND fs.scanned_at >= ? AND fs.scanned_at < ?`,
      [...ids, start, end],
    ),
    query<{ holiday_date: string; description: string }>(
      "SELECT holiday_date, description FROM holidays WHERE holiday_date >= ? AND holiday_date < ? ORDER BY holiday_date",
      [`${month}-01`, `${nextMonth}-01`],
    ),
    query<RamadhanRange>("SELECT start_date, end_date FROM ramadhan_periods"),
    query<WorkHourRule>("SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules"),
    query<{ employee_id: string; id: string; name: string; start_date: string; end_date: string }>(
      `SELECT lr.employee_id, lt.id, lt.name, lr.start_date, lr.end_date
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id IN (${idPlaceholders}) AND lr.status = 'disetujui'
         AND lr.start_date < ? AND lr.end_date >= ?`,
      [...ids, `${nextMonth}-01`, `${month}-01`],
    ),
    query<LeaveTypeInfo>("SELECT id, name FROM leave_types WHERE id LIKE 'C%' ORDER BY id"),
  ]);

  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));
  const holidays: HolidayInfo[] = holidayRows.map((h) => ({ date: h.holiday_date, description: h.description }));

  const pingsByEmployee = new Map<string, { created_at: string; within_radius: number }[]>();
  for (const p of pingRows) {
    const list = pingsByEmployee.get(p.employee_id);
    const entry = { created_at: dbDatetimeToIso(p.created_at)!, within_radius: p.within_radius };
    if (list) list.push(entry);
    else pingsByEmployee.set(p.employee_id, [entry]);
  }
  const scansByEmployee = new Map<string, { scanned_at: string }[]>();
  for (const s of scanRows) {
    const list = scansByEmployee.get(s.employee_id);
    const entry = { scanned_at: dbDatetimeToIso(s.scanned_at)! };
    if (list) list.push(entry);
    else scansByEmployee.set(s.employee_id, [entry]);
  }
  const leaveByEmployee = new Map<string, typeof leaveRows>();
  for (const l of leaveRows) {
    const list = leaveByEmployee.get(l.employee_id);
    if (list) list.push(l);
    else leaveByEmployee.set(l.employee_id, [l]);
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysByEmployee = new Map<string, ExportDay[]>();

  for (const e of employees) {
    const pings = pingsByEmployee.get(e.id) ?? [];
    const scans = scansByEmployee.get(e.id) ?? [];
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

    const days: ExportDay[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const leave = leaves.find((l) => date >= l.start_date && date <= l.end_date);
      const daily = computeDailyStatus(
        date,
        pingsByDate.get(date) ?? [],
        !!e.uses_shift,
        holidayDates,
        ramadhanPeriods,
        rules,
        scansByDate.get(date) ?? [],
        leave ? { id: leave.id, name: leave.name } : null,
      );
      days.push({
        date,
        status: daily.status,
        jamMasuk: daily.jamMasuk,
        jamPulang: daily.jamPulang,
        sumber: daily.sumber,
        telatMenit: daily.telatMenit,
        pulangCepatMenit: daily.pulangCepatMenit,
        leaveTypeId: daily.leaveTypeId,
      });
    }
    daysByEmployee.set(e.id, days);
  }

  // Kelompokkan berdasarkan unit asli pegawai (bukan mode "jenis laporan" terpisah
  // seperti legacy) -- ini otomatis mereplikasi mode "Per Unit" cobakinerja apa pun cara
  // pegawai dipilih di UI (checkbox lintas unit, filter unit tunggal, atau filter
  // kategori). Pegawai tanpa unit masuk grup "Tanpa Unit". Diurutkan alfabetis nama unit
  // supaya konsisten walau hasil query awal tidak berurutan per unit.
  const groupsByUnit = new Map<string, ExportEmployee[]>();
  for (const e of employees) {
    const unitName = e.unit_name ?? "Tanpa Unit";
    const list = groupsByUnit.get(unitName);
    const emp: ExportEmployee = { id: e.id, name: e.name, nip: e.nip, unitName, rankCode: e.rank_code };
    if (list) list.push(emp);
    else groupsByUnit.set(unitName, [emp]);
  }
  const unitGroups: UnitGroup[] = Array.from(groupsByUnit.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([unitName, groupEmployees]) => ({ unitName, employees: groupEmployees }));

  if (format === "pdf") {
    const buffer = await buildAttendanceGridPdf(unitGroups, daysByEmployee, month, holidays, cutiTypes);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="presensi_${month}.pdf"`,
      },
    });
  }

  const buffer = await buildAttendanceGridExcel(unitGroups, daysByEmployee, month, holidays, cutiTypes);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="presensi_${month}.xlsx"`,
    },
  });
}
