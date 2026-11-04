import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { queryOne, dbDatetimeToIso } from "../../../../../lib/db";
import { computeTukinDetail } from "../../../../../lib/tukin-detail";

export const dynamic = "force-dynamic";

function secretMatches(given: string | null): boolean {
  const expected = process.env.KINERJA_INTERNAL_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Endpoint server-ke-server untuk halaman "Tunjangan Kinerja" milik pegawai di
// dashboard-kinerja. TIDAK pakai session presensi (pegawai biasa tidak bisa login ke sini)
// -- diautentikasi lewat header x-internal-secret = KINERJA_INTERNAL_SECRET (secret bersama
// yang sama dengan yang sudah dipakai kinerja/dashboard-kinerja). dashboard-kinerja wajib
// mengisi employeeId dari session pegawai yang login sendiri, bukan dari input pengguna.
export async function GET(req: NextRequest, { params }: { params: { employeeId: string } }) {
  if (!secretMatches(req.headers.get("x-internal-secret"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Parameter period (YYYY-MM) wajib diisi." }, { status: 400 });
  }

  const detail = await computeTukinDetail(params.employeeId, period);
  if (!detail) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  // Hasil tombol "Hitung Tunjangan Kinerja" admin untuk bulan ini (kalau sudah) -- supaya
  // pegawai bisa membedakan angka sementara (dihitung langsung dari presensi terkini) dari
  // angka yang sudah ditetapkan admin.
  const official = await queryOne<{ deduction_percent: string; net_amount: string; calculated_at: string }>(
    "SELECT deduction_percent, net_amount, calculated_at FROM tukin_calculations WHERE employee_id = ? AND period = ?",
    [params.employeeId, period],
  );

  return NextResponse.json({
    ...detail,
    official: official
      ? {
          deductionPercent: Number(official.deduction_percent),
          netAmount: Number(official.net_amount),
          calculatedAt: dbDatetimeToIso(official.calculated_at),
        }
      : null,
  });
}
