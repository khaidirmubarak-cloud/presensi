import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 50, 100];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const rankId = searchParams.get("rank_id")?.trim() || "";
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const offset = (page - 1) * pageSize;

  const where = rankId ? "WHERE s.rank_id = ?" : "";
  const params = rankId ? [rankId] : [];

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM salary_scales s ${where}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const scales = await query(
    `SELECT s.id, s.rank_id, r.code AS rank_code, s.years, s.nominal
     FROM salary_scales s
     JOIN ranks r ON r.id = s.rank_id
     ${where}
     ORDER BY r.id, s.years
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return NextResponse.json({ scales, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rankId = typeof body?.rank_id === "string" ? body.rank_id.trim() : "";
  const years = Number(body?.years);
  const nominal = Number(body?.nominal);

  if (!rankId || !Number.isFinite(years) || years < 0) {
    return NextResponse.json({ error: "Golongan dan masa kerja (tahun) wajib diisi." }, { status: 400 });
  }
  if (!Number.isFinite(nominal) || nominal < 0) {
    return NextResponse.json({ error: "Nominal tidak valid." }, { status: 400 });
  }

  const rank = await queryOne("SELECT id FROM ranks WHERE id = ?", [rankId]);
  if (!rank) {
    return NextResponse.json({ error: "Golongan tidak ditemukan." }, { status: 404 });
  }
  const existing = await queryOne("SELECT id FROM salary_scales WHERE rank_id = ? AND years = ?", [rankId, years]);
  if (existing) {
    return NextResponse.json({ error: "Baris untuk golongan dan masa kerja ini sudah ada." }, { status: 409 });
  }

  const result = await execute("INSERT INTO salary_scales (rank_id, years, nominal) VALUES (?, ?, ?)", [
    rankId,
    years,
    nominal,
  ]);
  return NextResponse.json({ scale: { id: result.insertId, rank_id: rankId, years, nominal } }, { status: 201 });
}
