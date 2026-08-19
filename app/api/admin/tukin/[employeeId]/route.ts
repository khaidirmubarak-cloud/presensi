import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, dbDatetimeToIso, toDbDatetime } from "../../../../../lib/db";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange } from "../../../../../lib/attendance-status";
import { computeDailyDeduction, computeMonthlyDeductionPercent, type DeductionTier, type StudyAssignmentType } from "../../../../../lib/tukin";
import { DAY_NAMES_ID } from "../../../../../lib/calendar";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

type PingRow = { created_at: string; within_radius: number };
type ScanRow = { scanned_at: string };

// Rincian harian potongan tukin satu pegawai satu bulan -- pelengkap /api/admin/tukin
// (batch semua pegawai, angka akhir saja).
export async function GET(req: NextRequest, { params }: { params: { employeeId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const witaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const period = /^\d{4}-\d{2}$/.test(searchParams.get("period") ?? "")
    ? (searchParams.get("period") as string)
    : witaToday.slice(0, 7);

  const employee = await queryOne<{
    id: string;
    name: string;
    nip: string | null;
    uses_shift: number | null;
    employee_category: string | null;
    job_class_name: string | null;
    job_class_amount: string | null;
    grade_name: string | null;
    grade_amount: string | null;
  }>(
    `SELECT e.id, e.name, e.nip, p.uses_shift, p.employee_category,
            jc.name AS job_class_name, jc.base_amount AS job_class_amount,
            g.name AS grade_name, g.base_amount AS grade_amount
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN job_classes jc ON jc.id = p.job_class_id
     LEFT JOIN tukin_nonpns_grades g ON g.id = p.tukin_nonpns_grade_id
     WHERE e.id = ?`,
    [params.employeeId],
  );
  if (!employee) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  const [y, m] = period.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const start = toDbDatetime(new Date(`${period}-01T00:00:00+08:00`));
  const end = toDbDatetime(new Date(`${nextMonth}-01T00:00:00+08:00`));

  const [pingRows, scanRows, holidayRows, ramadhanPeriods, rules, leaveRows, leaveTypeRows, settingsRow, tierRows, studyRow] =
    await Promise.all([
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
      query<{ holiday_date: string }>("SELECT holiday_date FROM holidays WHERE holiday_date >= ? AND holiday_date < ?", [
        `${period}-01`,
        `${nextMonth}-01`,
      ]),
      query<RamadhanRange>("SELECT start_date, end_date FROM ramadhan_periods"),
      query<WorkHourRule>("SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules"),
      query<{ id: string; name: string; start_date: string; end_date: string }>(
        `SELECT lt.id, lt.name, lr.start_date, lr.end_date FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.employee_id = ? AND lr.status = 'disetujui'
           AND lr.start_date < ? AND lr.end_date >= ?`,
        [employee.id, `${nextMonth}-01`, `${period}-01`],
      ),
      query<{ id: string; tukin_deduction_percent: string }>("SELECT id, tukin_deduction_percent FROM leave_types"),
      queryOne<{ alpa_deduction_percent: string }>("SELECT alpa_deduction_percent FROM tukin_settings WHERE id = 1"),
      query<{ max_minutes: number | null; percent: string }>("SELECT max_minutes, percent FROM tukin_deduction_tiers ORDER BY sort_order"),
      queryOne<{ type: StudyAssignmentType }>(
        "SELECT type FROM study_assignments WHERE employee_id = ? AND status = 'aktif' LIMIT 1",
        [employee.id],
      ),
    ]);

  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));
  const leaveDeductionPercentById = new Map(leaveTypeRows.map((r) => [r.id, Number(r.tukin_deduction_percent)]));
  const alpaDeductionPercent = Number(settingsRow?.alpa_deduction_percent ?? 3);
  const tiers: DeductionTier[] = tierRows.map((t) => ({ max_minutes: t.max_minutes, percent: Number(t.percent) }));
  const studyAssignmentType: StudyAssignmentType = studyRow?.type ?? null;
  const isExempt = employee.employee_category === "DOKTER" || employee.employee_category === "KLINIK";

  const baseAmount =
    employee.grade_amount !== null ? Number(employee.grade_amount) : employee.job_class_amount !== null ? Number(employee.job_class_amount) : null;

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
  const dailyStatuses = [];
  let telatTotal = 0;
  let pulangCepatTotal = 0;
  let alpaTotal = 0;
  let leaveTotal = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${period}-${String(day).padStart(2, "0")}`;
    const leave = leaveRows.find((l) => date >= l.start_date && date <= l.end_date);
    const daily = computeDailyStatus(
      date,
      pingsByDate.get(date) ?? [],
      !!employee.uses_shift,
      holidayDates,
      ramadhanPeriods,
      rules,
      scansByDate.get(date) ?? [],
      leave ? { id: leave.id, name: leave.name } : null,
    );
    dailyStatuses.push(daily);

    const breakdown = computeDailyDeduction(daily, tiers, leaveDeductionPercentById, alpaDeductionPercent);
    telatTotal += breakdown.telatPercent;
    pulangCepatTotal += breakdown.pulangCepatPercent;
    alpaTotal += breakdown.alpaPercent;
    leaveTotal += breakdown.leavePercent;

    days.push({
      date,
      dayName: DAY_NAMES_ID[new Date(`${date}T00:00:00Z`).getUTCDay()],
      status: daily.status,
      telatMenit: daily.telatMenit,
      telatPercent: breakdown.telatPercent,
      pulangCepatMenit: daily.pulangCepatMenit,
      pulangCepatPercent: breakdown.pulangCepatPercent,
      alpaPercent: breakdown.alpaPercent,
      leavePercent: breakdown.leavePercent,
      leaveTypeName: daily.leaveTypeName,
      totalPercent: breakdown.totalPercent,
      potonganRp: baseAmount !== null ? Math.round((baseAmount * breakdown.totalPercent) / 100) : null,
    });
  }
  days.reverse(); // terbaru dulu

  const rawTotalPercent = telatTotal + pulangCepatTotal + alpaTotal + leaveTotal;
  const officialPercent = computeMonthlyDeductionPercent(
    dailyStatuses,
    tiers,
    leaveDeductionPercentById,
    alpaDeductionPercent,
    isExempt,
    studyAssignmentType,
  );
  const overrideReason = isExempt
    ? "Dikecualikan total dari potongan (Dokter/Klinik)"
    : studyAssignmentType === "tube1"
      ? "Tugas Belajar TUBE1 (potongan dinolkan)"
      : studyAssignmentType === "tube2"
        ? "Tugas Belajar TUBE2 (potongan flat 50%)"
        : null;

  return NextResponse.json({
    employee: {
      id: employee.id,
      name: employee.name,
      nip: employee.nip,
      category: employee.grade_name ?? employee.job_class_name,
      baseAmount,
    },
    period,
    days,
    summary: {
      telatTotal,
      pulangCepatTotal,
      alpaTotal,
      leaveTotal,
      rawTotalPercent: Math.min(rawTotalPercent, 100),
      officialPercent,
      overrideReason,
      officialDeductionAmount: baseAmount !== null ? Math.round((baseAmount * officialPercent) / 100) : null,
      officialNetAmount:
        baseAmount !== null ? Math.max(baseAmount - Math.round((baseAmount * officialPercent) / 100), 0) : null,
    },
  });
}
