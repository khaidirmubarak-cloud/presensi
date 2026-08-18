import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query, queryOne, execute } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

type PegawaiRow = {
  id: string;
  name: string;
  nip: string | null;
  department: string | null;
  status: string;
  employee_category: string | null;
  employment_status: string | null;
  rank_code: string | null;
  unit_name: string | null;
  position_title: string | null;
};

const ALLOWED_PAGE_SIZES = [10, 50, 100];

// List gabungan employees + employee_profiles (LEFT JOIN -- pegawai hasil sync Sevima
// belum tentu punya baris profile) + nama tabel referensi untuk ditampilkan di kolom.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const offset = (page - 1) * pageSize;

  const where = q ? "WHERE e.name LIKE ? OR e.nip LIKE ?" : "";
  const whereParams = q ? [`%${q}%`, `%${q}%`] : [];

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM employees e ${where}`,
    whereParams,
  );
  const total = countRow?.total ?? 0;

  const pegawai = await query<PegawaiRow>(
    `SELECT
       e.id, e.name, e.nip, e.department, e.status,
       p.employee_category, p.employment_status,
       r.code AS rank_code,
       u.name AS unit_name,
       p.position_title
     FROM employees e
     LEFT JOIN employee_profiles p ON p.employee_id = e.id
     LEFT JOIN ranks r ON r.id = p.rank_id
     LEFT JOIN units u ON u.id = p.unit_id
     ${where}
     ORDER BY e.name
     LIMIT ? OFFSET ?`,
    [...whereParams, pageSize, offset],
  );

  return NextResponse.json({ pegawai, total, page, pageSize });
}

// Create dasar (nama+NIP saja) -- sama seperti dashboard-kinerja, onboarding penuh
// (golongan/unit/jabatan/dst.) terjadi di halaman detail setelah baris ini dibuat.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.trim() : "";

  if (!name || !nip) {
    return NextResponse.json({ error: "Nama lengkap dan NIP wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne<{ id: string }>("SELECT id FROM employees WHERE nip = ?", [nip]);
  if (existing) {
    return NextResponse.json({ error: "NIP ini sudah terdaftar." }, { status: 409 });
  }

  const id = randomUUID();
  try {
    await execute(
      "INSERT INTO employees (id, name, nip, status, role) VALUES (?, ?, ?, 'pending', 'pegawai')",
      [id, name, nip],
    );
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan data pegawai." }, { status: 500 });
  }

  return NextResponse.json({ pegawai: { id, name, nip } }, { status: 201 });
}
