import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";
import { listDates, syncSevimaPresensi, todayWita } from "../../../../../../lib/sevima-presensi";

export const dynamic = "force-dynamic";

// Akui / cabut pengakuan presensi aplikasi Sevima untuk satu pegawai (keputusan admin
// kepegawaian, lihat SCAN_EMPLOYEE_JOIN di lib/finger.ts). Saat diakui, presensi Sevima bulan
// berjalan pegawai ini langsung ditarik (+-30 permintaan) supaya langsung terhitung; bulan
// sebelumnya lewat `npm run sync:sevima-presensi` di server. Mencabut tidak menghapus data --
// scan Sevima yang sudah tersimpan hanya tidak dihitung lagi.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (typeof body?.allowed !== "boolean") {
    return NextResponse.json({ error: "Parameter allowed (true/false) wajib diisi." }, { status: 400 });
  }
  const allowed: boolean = body.allowed;

  const employee = await queryOne<{ id: string; finger_id: number | null }>(
    "SELECT id, finger_id FROM employees WHERE id = ?",
    [params.id],
  );
  if (!employee) return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });

  await execute("UPDATE employees SET sevima_presensi_allowed = ? WHERE id = ?", [allowed ? 1 : 0, params.id]);

  let pulled: { jamBaru: number; recordAdaJam: number; gagal: number } | null = null;
  let pullNote: string | null = null;
  if (allowed) {
    if (employee.finger_id === null) {
      pullNote = "Pegawai belum punya ID finger — presensi Sevima baru bisa ditarik setelah ID finger diisi.";
    } else if (!process.env.SEVIMA_APP_KEY || !process.env.SEVIMA_SECRET_KEY) {
      pullNote = "Kredensial Sevima belum diisi di server — presensi belum ditarik.";
    } else {
      const today = todayWita();
      try {
        const r = await syncSevimaPresensi(listDates(`${today.slice(0, 7)}-01`, today)!, { employeeId: params.id });
        pulled = { jamBaru: r.jamBaru, recordAdaJam: r.recordAdaJam, gagal: r.gagal };
        if (r.pegawaiDicek === 0) pullNote = "ID finger pegawai ini tidak ditemukan di data Sevima (no_akun_finger).";
      } catch (err) {
        console.error("Tarik presensi Sevima saat pengakuan gagal:", err);
        pullNote = `Pengakuan tersimpan, tetapi gagal menarik presensi dari Sevima (${err instanceof Error ? err.message : String(err)}).`;
      }
    }
  }

  return NextResponse.json({ sevima_presensi_allowed: allowed ? 1 : 0, pulled, pullNote });
}
