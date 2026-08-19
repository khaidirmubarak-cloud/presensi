import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, dbDatetimeToIso, toDbDatetime } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange, type DailyStatusResult } from "../../../../lib/attendance-status";
import { computeMonthlyDeductionPercent, type StudyAssignmentType } from "../../../../lib/tukin";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  name: string;
  nip: string | null;
  uses_shift: number | null;
  employee_category: string | null;
  job_class_name: string | null;
  job_class_amount: string | null;
  grade_name: string | null;
  grade_amount: string | null;
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

  const rows = await query(
    `SELECT tc.employee_id, e.name, e.nip,
            COALESCE(g.name, jc.name) AS category,
            tc.base_amount, tc.deduction_percent, tc.deduction_amount, tc.net_amount, tc.calculated_at
     FROM tukin_calculations tc
     JOIN employees e ON e.id = tc.employee_id
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN job_classes jc ON jc.id = p.job_class_id
     LEFT JOIN tukin_nonpns_grades g ON g.id = p.tukin_nonpns_grade_id
     WHERE tc.period = ? ${where}
     ORDER BY e.name`,
    params,
  );

  return NextResponse.json({ period, calculations: rows });
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

  // Data global, sekali fetch (dipakai semua pegawai).
  const [holidayRows, ramadhanPeriods, rules, leaveTypeRows, settingsRow] = await Promise.all([
    query<{ holiday_date: string }>("SELECT holiday_date FROM holidays WHERE holiday_date >= ? AND holiday_date < ?", [
      `${period}-01`,
      `${nextMonth}-01`,
    ]),
    query<RamadhanRange>("SELECT start_date, end_date FROM ramadhan_periods"),
    query<WorkHourRule>("SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules"),
    query<{ id: string; tukin_deduction_percent: string }>("SELECT id, tukin_deduction_percent FROM leave_types"),
    queryOne<{ alpa_deduction_percent: string }>("SELECT alpa_deduction_percent FROM tukin_settings WHERE id = 1"),
  ]);
  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));
  const leaveDeductionPercentById = new Map(leaveTypeRows.map((r) => [r.id, Number(r.tukin_deduction_percent)]));
  const alpaDeductionPercent = Number(settingsRow?.alpa_deduction_percent ?? 3);

  // Semua pegawai aktif + resolusi nominal dasar (kelas jabatan ASN vs grade non-ASN).
  const employees = await query<EmployeeRow>(
    `SELECT e.id, e.name, e.nip, p.uses_shift, p.employee_category,
            jc.name AS job_class_name, jc.base_amount AS job_class_amount,
            g.name AS grade_name, g.base_amount AS grade_amount
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN job_classes jc ON jc.id = p.job_class_id
     LEFT JOIN tukin_nonpns_grades g ON g.id = p.tukin_nonpns_grade_id
     WHERE e.status = 'active' AND (p.employment_status IS NULL OR p.employment_status = 'aktif')`,
  );

  const studyRows = await query<{ employee_id: string; type: StudyAssignmentType }>(
    "SELECT employee_id, type FROM study_assignments WHERE status = 'aktif'",
  );
  const studyByEmployee = new Map(studyRows.map((r) => [r.employee_id, r.type]));

  // Bulk-fetch presensi & cuti SEMUA pegawai untuk rentang bulan ini sekaligus -- pola
  // sama seperti app/api/admin/presensi/route.ts, hindari N+1 query per 500+ pegawai.
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
  const results: { employeeId: string; baseAmount: number; deductionPercent: number; deductionAmount: number; netAmount: number }[] = [];

  for (const e of employees) {
    const baseAmount = e.grade_amount !== null ? Number(e.grade_amount) : e.job_class_amount !== null ? Number(e.job_class_amount) : null;
    if (baseAmount === null) {
      skipped.push({ employeeId: e.id, name: e.name, reason: "Belum ada nominal tukin (kelas jabatan/grade non-ASN)" });
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

    const dailyStatuses: DailyStatusResult[] = dateKeys.map((date) => {
      const leave = leaves.find((l) => date >= l.start_date && date <= l.end_date);
      return computeDailyStatus(
        date,
        pingsByDate.get(date) ?? [],
        !!e.uses_shift,
        holidayDates,
        ramadhanPeriods,
        rules,
        scansByDate.get(date) ?? [],
        leave ? { id: leave.leave_type_id, name: leave.leave_type_name } : null,
      );
    });

    const isExempt = e.employee_category === "DOKTER" || e.employee_category === "KLINIK";
    const deductionPercent = computeMonthlyDeductionPercent(
      dailyStatuses,
      leaveDeductionPercentById,
      alpaDeductionPercent,
      isExempt,
      studyByEmployee.get(e.id) ?? null,
    );
    const deductionAmount = Math.round((baseAmount * deductionPercent) / 100);
    const netAmount = Math.max(baseAmount - deductionAmount, 0);

    results.push({ employeeId: e.id, baseAmount, deductionPercent, deductionAmount, netAmount });
  }

  // Upsert batch (bukan satu execute() per pegawai -- pola sama seperti migrasi cuti/lembur).
  const BATCH_SIZE = 200;
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const values = batch.flatMap((r) => [r.employeeId, period, r.baseAmount, r.deductionPercent, r.deductionAmount, r.netAmount]);
    await execute(
      `INSERT INTO tukin_calculations (employee_id, period, base_amount, deduction_percent, deduction_amount, net_amount)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         base_amount = VALUES(base_amount), deduction_percent = VALUES(deduction_percent),
         deduction_amount = VALUES(deduction_amount), net_amount = VALUES(net_amount),
         calculated_at = CURRENT_TIMESTAMP`,
      values,
    );
  }

  return NextResponse.json({ period, calculated: results.length, skipped });
}
