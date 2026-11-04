import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { buildMealReportPdf, buildMealReportExcel, type MealReportRow } from "../../../../../lib/uang-makan-export";

export const dynamic = "force-dynamic";

type Row = {
  name: string;
  nip: string | null;
  rank_code: string | null;
  unit_name: string | null;
  eligible_days: number;
  gross_amount: string;
  tax_percent: string;
  net_amount: string;
};

// Cetak rekap uang makan 1 bulan (PDF/Excel) -- pola sama dengan cetak Tunjangan Kinerja
// (app/api/admin/tukin/export/route.ts): angka dibaca dari meal_allowance_calculations
// (hasil tombol "Hitung Uang Makan"), pilihan pegawai lewat employeeIds, atau semua yang
// cocok dengan pencarian saat ini.
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
  const employeeIds: string[] = Array.isArray(body?.employeeIds)
    ? body.employeeIds.filter((id: unknown) => typeof id === "string")
    : [];
  const q = typeof body?.q === "string" ? body.q.trim() : "";

  const conditions: string[] = ["mac.period = ?"];
  const params: string[] = [period];
  if (employeeIds.length > 0) {
    conditions.push(`e.id IN (${employeeIds.map(() => "?").join(",")})`);
    params.push(...employeeIds);
  } else if (q) {
    conditions.push("(e.name LIKE ? OR e.nip LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  // Urutan sama dengan lapum.php cobakinerja: golongan tertinggi dulu (ranks.id = id_golongan
  // lama, numerik), lalu NIP.
  const rows = await query<Row>(
    `SELECT e.name, e.nip, r.code AS rank_code, u.name AS unit_name,
            mac.eligible_days, mac.gross_amount, mac.tax_percent, mac.net_amount
     FROM meal_allowance_calculations mac
     JOIN employees e ON e.id = mac.employee_id
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN ranks r ON r.id = p.rank_id
     LEFT JOIN units u ON u.id = p.unit_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY CAST(p.rank_id AS UNSIGNED) DESC, e.nip, e.name`,
    params,
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Belum dihitung untuk periode ini -- klik \"Hitung Uang Makan\" terlebih dahulu." },
      { status: 400 },
    );
  }

  const reportRows: MealReportRow[] = rows.map((r, index) => ({
    no: index + 1,
    name: r.name,
    nip: r.nip,
    rankCode: r.rank_code,
    unitName: r.unit_name,
    eligibleDays: Number(r.eligible_days),
    grossAmount: Number(r.gross_amount),
    taxPercent: Number(r.tax_percent),
    netAmount: Number(r.net_amount),
  }));

  if (format === "pdf") {
    const buffer = await buildMealReportPdf(reportRows, period);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="uang_makan_${period}.pdf"`,
      },
    });
  }

  const buffer = await buildMealReportExcel(reportRows, period);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="uang_makan_${period}.xlsx"`,
    },
  });
}
