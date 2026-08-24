import { NextRequest, NextResponse } from "next/server";
import { query, dbDatetimeToIso, toDbDatetime } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange } from "../../../../../lib/attendance-status";
import type { DeductionTier } from "../../../../../lib/tukin";
import {
  buildTukinReportPdf,
  buildTukinReportExcel,
  summarizeTukinBreakdown,
  type TukinReportRow,
} from "../../../../../lib/tukin-export";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  name: string;
  nip: string | null;
  uses_shift: number | null;
  employee_category: string | null;
  rank_title: string | null;
  rank_code: string | null;
  job_class_id: number | null;
  position_name: string | null;
  job_class_amount: string;
  initial_deduction: string;
  base_amount: string;
  deduction_percent: string;
  deduction_amount: string;
  net_amount: string;
};

// Cetak rekap tunjangan kinerja 1 bulan untuk banyak pegawai sekaligus (PDF/Excel).
// Angka Rupiah dibaca dari tukin_calculations (hasil tombol "Hitung Tunjangan Kinerja" di
// app/api/admin/tukin/route.ts POST) supaya selalu identik dengan tabel /admin/tukin --
// cuma breakdown 11 kategori (TK/I/C5/TL1-4/PSW1-4) yang dihitung ulang fresh dari
// presensi/cuti bulan itu (tidak tersimpan di tukin_calculations).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const period = typeof body?.period === "string" && /^\d{4}-\d{2}$/.test(body.period) ? body.period : "";
  const format = body?.format === "pdf" || body?.format === "excel" ? body.format : "";
  if (!period || !format) {
    return NextResponse.json({ error: "Parameter period (YYYY-MM) dan format wajib diisi." }, { status: 400 });
  }
  const employeeIds: string[] = Array.isArray(body?.employeeIds) ? body.employeeIds.filter((id: unknown) => typeof id === "string") : [];
  const q = typeof body?.q === "string" ? body.q.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";

  const SELECT = `
    SELECT e.id, e.name, e.nip, p.uses_shift, p.employee_category,
           r.title AS rank_title, r.code AS rank_code,
           COALESCE(fp.job_class_id, p.job_class_id) AS job_class_id,
           COALESCE(fp.name, g.name) AS position_name,
           tc.job_class_amount, tc.initial_deduction, tc.base_amount,
           tc.deduction_percent, tc.deduction_amount, tc.net_amount
    FROM employees e
    JOIN tukin_calculations tc ON tc.employee_id = e.id AND tc.period = ?
    LEFT JOIN employee_profiles p ON p.employee_id = e.id
    LEFT JOIN ranks r ON r.id = p.rank_id
    LEFT JOIN functional_positions fp ON fp.id = p.functional_position_id
    LEFT JOIN job_classes jc ON jc.id = COALESCE(fp.job_class_id, p.job_class_id)
    LEFT JOIN tukin_nonpns_grades g ON g.id = p.tukin_nonpns_grade_id`;

  let employees: EmployeeRow[];
  if (employeeIds.length > 0) {
    employees = await query<EmployeeRow>(
      `${SELECT} WHERE e.id IN (${employeeIds.map(() => "?").join(",")}) ORDER BY e.name`,
      [period, ...employeeIds],
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
    employees = await query<EmployeeRow>(`${SELECT} WHERE 1=1 ${where} ORDER BY e.name`, [period, ...params]);
  }

  if (employees.length === 0) {
    return NextResponse.json(
      { error: "Belum dihitung untuk periode ini -- klik \"Hitung Tunjangan Kinerja\" di menu Tunjangan Kinerja terlebih dahulu." },
      { status: 400 },
    );
  }

  const [y, m] = period.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const start = toDbDatetime(new Date(`${period}-01T00:00:00+08:00`));
  const end = toDbDatetime(new Date(`${nextMonth}-01T00:00:00+08:00`));
  const ids = employees.map((e) => e.id);
  const idPlaceholders = ids.map(() => "?").join(",");

  const [pingRows, scanRows, holidayRows, ramadhanPeriods, rules, leaveRows, tierRows, leaveTypeRows, settingsRow] = await Promise.all([
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
    query<{ holiday_date: string }>("SELECT holiday_date FROM holidays WHERE holiday_date >= ? AND holiday_date < ?", [
      `${period}-01`,
      `${nextMonth}-01`,
    ]),
    query<RamadhanRange>("SELECT start_date, end_date FROM ramadhan_periods"),
    query<WorkHourRule>("SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules"),
    query<{ employee_id: string; id: string; name: string; start_date: string; end_date: string }>(
      `SELECT lr.employee_id, lt.id, lt.name, lr.start_date, lr.end_date
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id IN (${idPlaceholders}) AND lr.status = 'disetujui'
         AND lr.start_date < ? AND lr.end_date >= ?`,
      [...ids, `${nextMonth}-01`, `${period}-01`],
    ),
    query<{ max_minutes: number | null; percent: string }>("SELECT max_minutes, percent FROM tukin_deduction_tiers ORDER BY sort_order"),
    query<{ id: string; tukin_deduction_percent: string }>("SELECT id, tukin_deduction_percent FROM leave_types"),
    query<{ alpa_deduction_percent: string }>("SELECT alpa_deduction_percent FROM tukin_settings WHERE id = 1"),
  ]);

  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));
  const tiers: DeductionTier[] = tierRows.map((t) => ({ max_minutes: t.max_minutes, percent: Number(t.percent) }));
  const leaveDeductionPercentById = new Map(leaveTypeRows.map((r) => [r.id, Number(r.tukin_deduction_percent)]));
  const alpaPercent = Number(settingsRow[0]?.alpa_deduction_percent ?? 3);
  const iPercent = leaveDeductionPercentById.get("I") ?? 0;
  const c5Percent = leaveDeductionPercentById.get("C5") ?? 0;
  const sortedTiers = [...tiers].sort((a, b) => (a.max_minutes ?? Infinity) - (b.max_minutes ?? Infinity));
  const tierPercents: [number, number, number, number] = [
    sortedTiers[0]?.percent ?? 0,
    sortedTiers[1]?.percent ?? 0,
    sortedTiers[2]?.percent ?? 0,
    sortedTiers[3]?.percent ?? 0,
  ];

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
  const dateKeys: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) dateKeys.push(`${period}-${String(day).padStart(2, "0")}`);

  const rows: TukinReportRow[] = employees.map((e, index) => {
    const pings = (pingsByEmployee.get(e.id) ?? []).map((p) => ({ created_at: p.created_at, within_radius: p.within_radius }));
    const scans = (scansByEmployee.get(e.id) ?? []).map((s) => ({ scanned_at: s.scanned_at }));
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

    const dailyStatuses = dateKeys.map((date) => {
      const leave = leaves.find((l) => date >= l.start_date && date <= l.end_date);
      return computeDailyStatus(
        date,
        pingsByDate.get(date) ?? [],
        !!e.uses_shift,
        holidayDates,
        ramadhanPeriods,
        rules,
        scansByDate.get(date) ?? [],
        leave ? { id: leave.id, name: leave.name } : null,
      );
    });

    const breakdown = summarizeTukinBreakdown(dailyStatuses, tiers, alpaPercent, iPercent, c5Percent);

    return {
      no: index + 1,
      name: e.name,
      rankLabel: e.rank_title && e.rank_code ? `${e.rank_title}, ${e.rank_code}` : e.rank_code ?? e.rank_title ?? null,
      nip: e.nip,
      employeeCategory: e.employee_category,
      positionName: e.position_name,
      jobClassId: e.job_class_id,
      jobClassAmount: Number(e.job_class_amount),
      initialDeduction: Number(e.initial_deduction),
      baseAmount: Number(e.base_amount),
      ...breakdown,
      deductionPercent: Number(e.deduction_percent),
      deductionAmount: Number(e.deduction_amount),
      netAmount: Number(e.net_amount),
    };
  });

  const rates = { alpaPercent, iPercent, c5Percent, tierPercents };

  if (format === "pdf") {
    const buffer = await buildTukinReportPdf(rows, period, rates);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tukin_${period}.pdf"`,
      },
    });
  }

  const buffer = await buildTukinReportExcel(rows, period, rates);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tukin_${period}.xlsx"`,
    },
  });
}
