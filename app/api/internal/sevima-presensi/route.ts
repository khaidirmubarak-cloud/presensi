import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { listDates, syncSevimaPresensi, todayWita } from "../../../../lib/sevima-presensi";

export const dynamic = "force-dynamic";

function secretMatches(given: string | null): boolean {
  const expected = process.env.KINERJA_INTERNAL_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Pemicu terjadwal (cron cPanel) untuk menarik presensi aplikasi Sevima ke fingerprint_scans
// -- lihat README "Presensi aplikasi Sevima". Header x-internal-secret = KINERJA_INTERNAL_SECRET.
// Tanpa parameter: hari ini (WITA). ?from=YYYY-MM-DD&to=YYYY-MM-DD untuk rentang (maks 3 hari).
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-internal-secret"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || todayWita();
  const dates = listDates(from, sp.get("to") || from);
  if (!dates || dates.length > 3) {
    return NextResponse.json({ error: "Rentang tanggal tidak valid (maks 3 hari)." }, { status: 400 });
  }
  try {
    const result = await syncSevimaPresensi(dates, { dryRun: sp.get("dryRun") === "1" });
    const { contoh: _contoh, ...summary } = result;
    return NextResponse.json(summary);
  } catch (err) {
    console.error("Sync presensi Sevima (cron) gagal:", err);
    return NextResponse.json({ error: "Gagal mengambil data dari Sevima." }, { status: 502 });
  }
}
