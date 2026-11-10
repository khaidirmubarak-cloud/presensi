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

  // Email dari data Sevima -> employee_login_emails, supaya "Masuk dengan Google" di
  // dashboard-kinerja langsung mengenali pegawai yang emailnya tercatat di Sevima.
  // Email yang dipakai lebih dari satu NIP di data Sevima sengaja dilewati (tidak bisa
  // dipastikan pemiliknya), dan email yang sudah terikat ke pegawai lain tidak ditimpa.
  let emailsLinked = 0;
  let emailNote: string | null = null;
  try {
    const ownersByEmail = new Map<string, Set<string>>();
    const candidates: { email: string; nip: string; source: string }[] = [];
    for (const emp of sevimaEmployees) {
      for (const [email, source] of [
        [emp.emailKampus, "sevima_email_kampus"],
        [emp.email, "sevima_email"],
      ] as const) {
        if (!email) continue;
        candidates.push({ email, nip: emp.nip, source });
        const owners = ownersByEmail.get(email) ?? new Set<string>();
        owners.add(emp.nip);
        ownersByEmail.set(email, owners);
      }
    }
    const idRows = await query<{ id: string; nip: string }>("SELECT id, nip FROM employees WHERE nip IS NOT NULL");
    const idByNip = new Map(idRows.map((r) => [r.nip, r.id]));
    for (const c of candidates) {
      if ((ownersByEmail.get(c.email)?.size ?? 0) > 1) continue;
      const employeeId = idByNip.get(c.nip);
      if (!employeeId) continue;
      const result = await execute(
        "INSERT IGNORE INTO employee_login_emails (email, employee_id, source) VALUES (?, ?, ?)",
        [c.email, employeeId, c.source],
      );
      emailsLinked += result.affectedRows;
    }
  } catch {
    emailNote = "Email login belum disinkronkan: tabel employee_login_emails belum dibuat (jalankan dashboard-kinerja/sql/003_employee_login_emails.sql).";
  }

  return NextResponse.json({
    total: sevimaEmployees.length,
    created,
    skipped: sevimaEmployees.length - created,
    emailsLinked,
    emailNote,
  });
}
