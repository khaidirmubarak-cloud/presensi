import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { computeTukinDetail } from "../../../../../lib/tukin-detail";

export const dynamic = "force-dynamic";

// Rincian harian potongan tukin satu pegawai satu bulan (admin). Perhitungannya ada di
// lib/tukin-detail.ts, dipakai bersama endpoint internal untuk dashboard-kinerja.
export async function GET(req: NextRequest, { params }: { params: { employeeId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const witaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const period = /^\d{4}-\d{2}$/.test(searchParams.get("period") ?? "")
    ? (searchParams.get("period") as string)
    : witaToday.slice(0, 7);

  const detail = await computeTukinDetail(params.employeeId, period);
  if (!detail) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json(detail);
}
