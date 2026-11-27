import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { fetchSevimaEmployees } from "../../../../../lib/sevima";
import { cleanNip } from "../../../../../lib/nip";

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

  // Pegawai dikenali lewat NIP yang sudah DIBERSIHKAN (lib/nip.ts), juga lewat NIDN / NIP lama
  // di employee_profiles -- supaya NIP dengan spasi/karakter tak terlihat/encoding rusak dari
  // cobakinerja, atau dosen yang di Sevima tercatat dengan NIDN, tidak dibuatkan baris ganda.
  const idRows = await query<{
    id: string;
    name: string;
    nip: string | null;
    nidn: string | null;
    nip_lama: string | null;
    legacy_id_user: string | null;
  }>(
    `SELECT e.id, e.name, e.nip, p.nidn, p.nip_lama, p.legacy_id_user
     FROM employees e LEFT JOIN employee_profiles p ON p.employee_id = e.id`,
  );
  const idByCleanNip = new Map<string, string>();
  for (const r of idRows) {
    for (const v of [r.nip, r.nidn, r.nip_lama]) {
      const key = cleanNip(v).toLowerCase();
      if (key && !idByCleanNip.has(key)) idByCleanNip.set(key, r.id);
    }
  }
  // NIP employees diutamakan di atas NIDN/NIP lama kalau ada tumpang tindih.
  for (const r of idRows) {
    const key = cleanNip(r.nip).toLowerCase();
    if (key) idByCleanNip.set(key, r.id);
  }

  // Cocok bila SALAH SATU identitas Sevima (nip, nip_pns, nidn, nidk) sama dengan NIP/NIDN/NIP
  // lama pegawai yang sudah ada -- di /dosen, "nip" sering berisi NIDN (lihat lib/sevima.ts).
  const findExisting = (emp: { ids: string[] }) => {
    for (const id of emp.ids) {
      const found = idByCleanNip.get(id.toLowerCase());
      if (found) return found;
    }
    return undefined;
  };
  // Hanya akun AKTIF di Sevima yang boleh membuat pegawai baru / menghubungkan email login.
  const activeEmployees = sevimaEmployees.filter((e) => e.active);
  const inactiveEmployees = sevimaEmployees.filter((e) => !e.active);
  const toInsert = activeEmployees.filter((e) => !findExisting(e));

  let created = 0;
  for (const emp of toInsert) {
    try {
      const newId = randomUUID();
      await execute(
        "INSERT INTO employees (id, name, nip, status, role) VALUES (?, ?, ?, 'pending', 'pegawai')",
        [newId, emp.name, emp.nip],
      );
      for (const id of emp.ids) idByCleanNip.set(id.toLowerCase(), newId);
      idByCleanNip.set(emp.nip.toLowerCase(), newId);
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
    const candidates: { email: string; nip: string; employeeId: string | undefined; source: string }[] = [];
    for (const emp of activeEmployees) {
      const employeeId = findExisting(emp);
      for (const [email, source] of [
        [emp.emailKampus, "sevima_email_kampus"],
        [emp.email, "sevima_email"],
      ] as const) {
        if (!email) continue;
        candidates.push({ email, nip: emp.nip, employeeId, source });
        const owners = ownersByEmail.get(email) ?? new Set<string>();
        owners.add(emp.nip);
        ownersByEmail.set(email, owners);
      }
    }
    for (const c of candidates) {
      if ((ownersByEmail.get(c.email)?.size ?? 0) > 1) continue;
      const employeeId = c.employeeId;
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

  // ID finger (no_akun_finger Sevima = ID di mesin) -> employees.finger_id, HANYA untuk pegawai
  // yang finger_id-nya masih kosong dan ID itu belum dipakai pegawai lain. Nilai yang sudah
  // ada tidak pernah ditimpa -- perbedaan dilaporkan ke admin untuk diputuskan di halaman
  // detail pegawai (lihat lib/finger.ts), karena scan mesin historis tercatat per finger_id.
  let fingersLinked = 0;
  let sevimaIdsSaved = 0;
  const fingerConflicts: { id: string; name: string; current: number | null; sevima: number; usedBy: string | null }[] = [];
  {
    const fingerRows = await query<{ id: string; name: string; finger_id: number | null; sevima_id: number | null }>(
      "SELECT id, name, finger_id, sevima_id FROM employees",
    );
    // id_pegawai Sevima -> employees.sevima_id, supaya penarikan presensi per pegawai cukup satu
    // permintaan tanpa mengambil daftar pegawai Sevima (lib/sevima-presensi.ts).
    {
      const byIdRow = new Map(fingerRows.map((r) => [r.id, r]));
      for (const emp of activeEmployees) {
        const employeeId = findExisting(emp);
        const row = employeeId ? byIdRow.get(employeeId) : undefined;
        if (!row || !(emp.sevimaId > 0) || Number(row.sevima_id) === emp.sevimaId) continue;
        await execute("UPDATE employees SET sevima_id = ? WHERE id = ?", [emp.sevimaId, row.id]);
        row.sevima_id = emp.sevimaId;
        sevimaIdsSaved++;
      }
    }
    const byId = new Map(fingerRows.map((r) => [r.id, r]));
    const ownerByFinger = new Map<number, { id: string; name: string }>();
    for (const r of fingerRows) if (r.finger_id !== null) ownerByFinger.set(Number(r.finger_id), r);

    // ID finger yang dipakai lebih dari satu akun aktif di Sevima tidak bisa dipastikan pemiliknya.
    const sevimaFingerCount = new Map<number, number>();
    for (const emp of activeEmployees) {
      if (emp.fingerId !== null) sevimaFingerCount.set(emp.fingerId, (sevimaFingerCount.get(emp.fingerId) ?? 0) + 1);
    }

    for (const emp of activeEmployees) {
      if (emp.fingerId === null || (sevimaFingerCount.get(emp.fingerId) ?? 0) > 1) continue;
      const employeeId = findExisting(emp);
      const row = employeeId ? byId.get(employeeId) : undefined;
      if (!row) continue;
      const current = row.finger_id === null ? null : Number(row.finger_id);
      if (current === emp.fingerId) continue;
      const owner = ownerByFinger.get(emp.fingerId);
      if (current === null && !owner) {
        try {
          const r = await execute("UPDATE employees SET finger_id = ? WHERE id = ? AND finger_id IS NULL", [emp.fingerId, row.id]);
          if (r.affectedRows > 0) {
            fingersLinked++;
            ownerByFinger.set(emp.fingerId, row);
            continue;
          }
        } catch {
          // UNIQUE bentrok karena request bersamaan -- laporkan sebagai konflik di bawah.
        }
      }
      fingerConflicts.push({
        id: row.id,
        name: row.name,
        current,
        sevima: emp.fingerId,
        usedBy: owner && owner.id !== row.id ? owner.name : null,
      });
    }
  }

  // Pegawai di sistem yang HANYA cocok dengan akun tidak aktif di Sevima (tidak ada akun aktif
  // yang cocok) -- dilaporkan ke admin untuk diputuskan (hapus / nonaktifkan), tidak diubah otomatis.
  const matchedByActive = new Set(activeEmployees.map(findExisting).filter(Boolean) as string[]);
  const rowById = new Map(idRows.map((r) => [r.id, r]));
  const inactiveExisting: { id: string; name: string; nip: string | null; sevimaStatus: string; origin: string }[] = [];
  const seenInactive = new Set<string>();
  for (const emp of inactiveEmployees) {
    const id = findExisting(emp);
    if (!id || matchedByActive.has(id) || seenInactive.has(id)) continue;
    seenInactive.add(id);
    const row = rowById.get(id);
    inactiveExisting.push({
      id,
      name: row?.name ?? emp.name,
      nip: row?.nip ?? emp.nip,
      sevimaStatus: emp.statusLabel,
      origin: row?.legacy_id_user ? "cobakinerja" : "Sevima/manual",
    });
  }

  return NextResponse.json({
    total: activeEmployees.length,
    created,
    skipped: activeEmployees.length - created,
    skippedInactive: inactiveEmployees.length,
    inactiveExisting,
    emailsLinked,
    emailNote,
    fingersLinked,
    fingerConflicts,
    sevimaIdsSaved,
  });
}
