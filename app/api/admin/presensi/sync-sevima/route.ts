import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { listDates, syncSevimaPresensi, todayWita } from "../../../../../lib/sevima-presensi";

export const dynamic = "force-dynamic";

// Tarik presensi aplikasi Sevima ke fingerprint_scans (lib/sevima-presensi.ts), dipicu admin
// dari halaman Presensi. employeeIds = pegawai yang dicentang (kosong = semua yang diakui);
// yang dicentang tapi tidak diakui dilewati. dryRun = pratinjau tanpa menulis apa pun. Rentang dibatasi pendek
// supaya request tidak kena timeout proxy cPanel (1 permintaan Sevima per pegawai per hari);
// untuk rentang panjang pakai `npm run sync:sevima-presensi` di server.
const MAX_ADMIN_DAYS = 3;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.SEVIMA_APP_KEY || !process.env.SEVIMA_SECRET_KEY) {
    return NextResponse.json(
      { error: "Kredensial Sevima (SEVIMA_APP_KEY/SEVIMA_SECRET_KEY) belum diisi di environment aplikasi presensi." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    from?: string;
    to?: string;
    dryRun?: boolean;
    employeeIds?: unknown;
  };
  const employeeIds = Array.isArray(body.employeeIds)
    ? body.employeeIds.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 1000)
    : [];
  const from = body.from || todayWita();
  const dates = listDates(from, body.to || from);
  if (!dates) return NextResponse.json({ error: "Tanggal tidak valid (format YYYY-MM-DD)." }, { status: 400 });
  if (dates.length > MAX_ADMIN_DAYS) {
    return NextResponse.json({ error: `Maksimal ${MAX_ADMIN_DAYS} hari sekali tarik dari halaman ini.` }, { status: 400 });
  }

  try {
    return NextResponse.json(await syncSevimaPresensi(dates, { dryRun: !!body.dryRun, employeeIds }));
  } catch (err) {
    console.error("Sync presensi Sevima gagal:", err);
    // Penyebab asli ditampilkan ke admin (bukan cuma di log) -- log aplikasi di host cPanel
    // ini tidak selalu mudah ditemukan. Isinya pesan teknis (mis. status API Sevima atau error
    // SQL), tidak memuat kredensial.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal menarik presensi dari Sevima: ${detail}` }, { status: 502 });
  }
}
