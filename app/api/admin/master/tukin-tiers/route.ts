import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Tier menit telat/pulang cepat, diseed 4 baris lewat sql/008 tapi jumlahnya fleksibel --
// lib/tukin.ts mengurutkan by max_minutes saat kalkulasi, bukan bergantung banyaknya baris.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tiers = await query("SELECT id, max_minutes, percent, sort_order FROM tukin_deduction_tiers ORDER BY sort_order");
  return NextResponse.json({ tiers });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const maxMinutes =
    body?.max_minutes === undefined || body?.max_minutes === null || body?.max_minutes === ""
      ? null
      : Number(body.max_minutes);
  const percent = Number(body?.percent);

  if (!Number.isFinite(percent) || percent < 0) {
    return NextResponse.json({ error: "Persentase tidak valid." }, { status: 400 });
  }
  if (maxMinutes !== null && (!Number.isFinite(maxMinutes) || maxMinutes < 0)) {
    return NextResponse.json({ error: "Batas menit tidak valid." }, { status: 400 });
  }

  const maxSortRow = await queryOne<{ maxSort: number | null }>(
    "SELECT MAX(sort_order) AS maxSort FROM tukin_deduction_tiers",
  );
  const sortOrder = (maxSortRow?.maxSort ?? 0) + 1;

  const result = await execute("INSERT INTO tukin_deduction_tiers (max_minutes, percent, sort_order) VALUES (?, ?, ?)", [
    maxMinutes,
    percent,
    sortOrder,
  ]);
  return NextResponse.json({ tier: { id: result.insertId, max_minutes: maxMinutes, percent, sort_order: sortOrder } }, { status: 201 });
}
