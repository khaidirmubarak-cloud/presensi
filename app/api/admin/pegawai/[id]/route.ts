import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

type PegawaiDetail = {
  id: string;
  name: string;
  nip: string | null;
  department: string | null;
  status: string;
  phone_number: string | null;
  legacy_id_user: string | null;
  nip_lama: string | null;
  nidn: string | null;
  bank_account_no: string | null;
  npwp: string | null;
  birth_date: string | null;
  photo_url: string | null;
  rank_id: string | null;
  unit_id: string | null;
  job_class_id: number | null;
  functional_position_id: string | null;
  tukin_nonpns_grade_id: number | null;
  position_title: string | null;
  position_effective_date: string | null;
  rank_effective_date: string | null;
  service_years: number | null;
  service_months: number | null;
  retirement_date: string | null;
  employee_category: string | null;
  employment_status: string | null;
  is_pegawai: number | null;
  is_dosen: number | null;
  is_serdos: number | null;
  lecturer_type: string | null;
  uses_shift: number | null;
  gets_meal_allowance: number | null;
  tukin_grade: number | null;
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pegawai = await queryOne<PegawaiDetail>(
    `SELECT
       e.id, e.name, e.nip, e.department, e.status, e.phone_number,
       p.legacy_id_user, p.nip_lama, p.nidn, p.bank_account_no, p.npwp,
       p.birth_date, p.photo_url,
       p.rank_id, p.unit_id, p.job_class_id, p.functional_position_id, p.tukin_nonpns_grade_id,
       p.position_title, p.position_effective_date, p.rank_effective_date,
       p.service_years, p.service_months, p.retirement_date,
       p.employee_category, p.employment_status,
       p.is_pegawai, p.is_dosen, p.is_serdos, p.lecturer_type, p.uses_shift,
       p.gets_meal_allowance, p.tukin_grade
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     WHERE e.id = ?`,
    [params.id],
  );

  if (!pegawai) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ pegawai });
}

// Kolom identitas/login (phone_number, password_hash, status, registration_token) di
// employees TIDAK PERNAH ditulis dari sini -- itu domain klaim-akun WA milik
// dashboard-kinerja. Endpoint ini cuma mengubah name/nip/department (field shared yang
// juga dipakai dashboard-kinerja) dan meng-upsert seluruh field HR ke employee_profiles.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const nip = typeof body.nip === "string" ? body.nip.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";

  if (!name || !nip) {
    return NextResponse.json({ error: "Nama lengkap dan NIP wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne<{ id: string }>("SELECT id FROM employees WHERE id = ?", [
    params.id,
  ]);
  if (!existing) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  const nipTaken = await queryOne<{ id: string }>(
    "SELECT id FROM employees WHERE nip = ? AND id != ?",
    [nip, params.id],
  );
  if (nipTaken) {
    return NextResponse.json({ error: "NIP ini sudah dipakai pegawai lain." }, { status: 409 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const int = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
  const bool = (v: unknown) => (v === "" || v === null || v === undefined ? null : v ? 1 : 0);

  try {
    await execute("UPDATE employees SET name = ?, nip = ?, department = ? WHERE id = ?", [
      name,
      nip,
      department || null,
      params.id,
    ]);

    await execute(
      `INSERT INTO employee_profiles (
         employee_id, nip_lama, nidn, bank_account_no, npwp, birth_date, photo_url,
         rank_id, unit_id, job_class_id, functional_position_id, tukin_nonpns_grade_id,
         position_title, position_effective_date, rank_effective_date,
         service_years, service_months, retirement_date,
         employee_category, employment_status,
         is_pegawai, is_dosen, is_serdos, lecturer_type, uses_shift,
         gets_meal_allowance, tukin_grade
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nip_lama = VALUES(nip_lama), nidn = VALUES(nidn), bank_account_no = VALUES(bank_account_no),
         npwp = VALUES(npwp), birth_date = VALUES(birth_date), photo_url = VALUES(photo_url),
         rank_id = VALUES(rank_id), unit_id = VALUES(unit_id), job_class_id = VALUES(job_class_id),
         functional_position_id = VALUES(functional_position_id),
         tukin_nonpns_grade_id = VALUES(tukin_nonpns_grade_id),
         position_title = VALUES(position_title),
         position_effective_date = VALUES(position_effective_date),
         rank_effective_date = VALUES(rank_effective_date),
         service_years = VALUES(service_years), service_months = VALUES(service_months),
         retirement_date = VALUES(retirement_date),
         employee_category = VALUES(employee_category), employment_status = VALUES(employment_status),
         is_pegawai = VALUES(is_pegawai), is_dosen = VALUES(is_dosen), is_serdos = VALUES(is_serdos),
         lecturer_type = VALUES(lecturer_type), uses_shift = VALUES(uses_shift),
         gets_meal_allowance = VALUES(gets_meal_allowance), tukin_grade = VALUES(tukin_grade)`,
      [
        params.id,
        str(body.nip_lama),
        str(body.nidn),
        str(body.bank_account_no),
        str(body.npwp),
        str(body.birth_date),
        str(body.photo_url),
        str(body.rank_id),
        str(body.unit_id),
        int(body.job_class_id),
        str(body.functional_position_id),
        int(body.tukin_nonpns_grade_id),
        str(body.position_title),
        str(body.position_effective_date),
        str(body.rank_effective_date),
        int(body.service_years),
        int(body.service_months),
        str(body.retirement_date),
        str(body.employee_category),
        str(body.employment_status) || "aktif",
        bool(body.is_pegawai),
        bool(body.is_dosen),
        bool(body.is_serdos),
        str(body.lecturer_type),
        bool(body.uses_shift),
        body.gets_meal_allowance === false ? 0 : 1,
        int(body.tukin_grade),
      ],
    );
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui data pegawai." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
