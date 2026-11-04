import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { fetchSevimaEmployees } from "../../../../../lib/sevima";

export const dynamic = "force-dynamic";

// Sinkron data pegawai dari Sevima ke tabel employees, dipicu manual oleh admin (dipindah
// dari dashboard-kinerja). Hanya menambahkan NIP yang belum ada -- tidak pernah menimpa
// baris existing, supaya pegawai yang sudah klaim akun (phone_number/password_hash terisi)
// atau sudah dilengkapi profilnya tidak tersentuh. Data kepegawaian (golongan/unit/dst.)
// tetap dilengkapi admin lewat halaman detail pegawai.
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.SEVIMA_APP_KEY || !process.env.SEVIMA_SECRET_KEY) {
    return NextResponse.json(
      { error: "Kredensial Sevima (SEVIMA_APP_KEY/SEVIMA_SECRET_KEY) belum diisi di environment aplikasi presensi." },
      { status: 500 },
    );
  }

  let sevimaEmployees;
  try {
    sevimaEmployees = await fetchSevimaEmployees();
  } catch {
    return NextResponse.json(
      { error: "Gagal mengambil data dari Sevima (cek kredensial & whitelist IP server di Sevima)." },
      { status: 502 },
    );
  }

  const existingRows = await query<{ nip: string }>("SELECT nip FROM employees WHERE nip IS NOT NULL");
  const existingNips = new Set(existingRows.map((r) => r.nip));

  const toInsert = sevimaEmployees.filter((e) => !existingNips.has(e.nip));

  let created = 0;
  for (const emp of toInsert) {
    try {
      await execute(
        "INSERT INTO employees (id, name, nip, status, role) VALUES (?, ?, ?, 'pending', 'pegawai')",
        [randomUUID(), emp.name, emp.nip],
      );
      created++;
    } catch {
      // NIP duplikat antar-request bersamaan atau data tidak valid -- lewati, lanjut ke berikutnya.
    }
  }

  return NextResponse.json({
    total: sevimaEmployees.length,
    created,
    skipped: sevimaEmployees.length - created,
  });
}
