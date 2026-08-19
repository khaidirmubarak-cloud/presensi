import { NextRequest, NextResponse } from "next/server";
import { query, dbDatetimeToIso, toDbDatetime } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";
import { computeDailyStatus, type WorkHourRule, type RamadhanRange } from "../../../../lib/attendance-status";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  name: string;
  nip: string | null;
  unit_name: string | null;
  uses_shift: number | null;
};

type PingRow = {
  employee_id: string;
  created_at: string;
  within_radius: number;
};

type ScanRow = {
  employee_id: string;
  scanned_at: string;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  // Default ke tanggal hari ini kalender WITA (bukan UTC) -- sama seperti todayIso() di
  // app/admin/presensi/page.tsx, supaya konsisten kalau endpoint dipanggil tanpa ?date=.
  const witaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const date = searchParams.get("date") || witaToday;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Parameter date tidak valid." }, { status: 400 });
  }

  const employees = await query<EmployeeRow>(
    `SELECT e.id, e.name, e.nip, u.name AS unit_name, p.uses_shift
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN units u ON u.id = p.unit_id
     WHERE p.employment_status IS NULL OR p.employment_status = 'aktif'
     ORDER BY e.name`,
  );

  // Batas hari kalender WITA (+08:00), pola sama seperti app/api/attendance/route.ts di
  // dashboard-kinerja (filter presensi per bulan).
  const start = toDbDatetime(new Date(`${date}T00:00:00+08:00`));
  const end = toDbDatetime(new Date(`${date}T23:59:59.999+08:00`));
  const pingRows = await query<PingRow>(
    `SELECT employee_id, created_at, within_radius FROM attendance_pings
     WHERE created_at BETWEEN ? AND ?`,
    [start, end],
  );

  const pingsByEmployee = new Map<string, PingRow[]>();
  for (const p of pingRows) {
    const list = pingsByEmployee.get(p.employee_id);
    if (list) list.push(p);
    else pingsByEmployee.set(p.employee_id, [p]);
  }

  // fingerprint_scans dihubungkan lewat employees.finger_id (bukan employee_id langsung) --
  // scan dengan finger_id yang tidak cocok pegawai manapun otomatis tidak ikut (misal
  // finger_id lama yang sudah tidak ter-assign).
  const scanRows = await query<ScanRow>(
    `SELECT e.id AS employee_id, fs.scanned_at FROM fingerprint_scans fs
     JOIN employees e ON e.finger_id = fs.finger_id
     WHERE fs.scanned_at BETWEEN ? AND ?`,
    [start, end],
  );
  const scansByEmployee = new Map<string, ScanRow[]>();
  for (const s of scanRows) {
    const list = scansByEmployee.get(s.employee_id);
    if (list) list.push(s);
    else scansByEmployee.set(s.employee_id, [s]);
  }

  const holidayRows = await query<{ holiday_date: string }>(
    "SELECT holiday_date FROM holidays WHERE holiday_date = ?",
    [date],
  );
  const holidayDates = new Set(holidayRows.map((h) => h.holiday_date));

  const ramadhanPeriods = await query<RamadhanRange>(
    "SELECT start_date, end_date FROM ramadhan_periods",
  );

  const rules = await query<WorkHourRule>(
    "SELECT day_type, period_type, check_in_time, check_out_time FROM work_hour_rules",
  );

  // Cuti/izin disetujui yang mencakup tanggal ini -- lihat lib/attendance-status.ts,
  // menang atas shift/ping/fingerprint (Fase 4).
  const leaveRows = await query<{ employee_id: string; id: string; name: string }>(
    `SELECT lr.employee_id, lt.id, lt.name FROM leave_requests lr
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.status = 'disetujui' AND ? BETWEEN lr.start_date AND lr.end_date`,
    [date],
  );
  const leaveByEmployee = new Map(leaveRows.map((r) => [r.employee_id, { id: r.id, name: r.name }]));

  const result = employees.map((e) => {
    const pings = (pingsByEmployee.get(e.id) ?? []).map((p) => ({
      created_at: dbDatetimeToIso(p.created_at)!,
      within_radius: p.within_radius,
    }));
    const scans = (scansByEmployee.get(e.id) ?? []).map((s) => ({
      scanned_at: dbDatetimeToIso(s.scanned_at)!,
    }));
    const daily = computeDailyStatus(
      date,
      pings,
      !!e.uses_shift,
      holidayDates,
      ramadhanPeriods,
      rules,
      scans,
      leaveByEmployee.get(e.id) ?? null,
    );
    return {
      employeeId: e.id,
      name: e.name,
      nip: e.nip,
      unitName: e.unit_name,
      ...daily,
    };
  });

  return NextResponse.json({ date, employees: result });
}
