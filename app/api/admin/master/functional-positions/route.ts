import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const functionalPositions = await query(
    `SELECT fp.id, fp.name, fp.job_class_id, jc.name AS job_class_name
     FROM functional_positions fp
     LEFT JOIN job_classes jc ON jc.id = fp.job_class_id
     ORDER BY fp.id`,
  );
  return NextResponse.json({ functionalPositions });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const jobClassId = Number.isFinite(Number(body?.job_class_id)) ? Number(body.job_class_id) : null;

  if (!id || !name) {
    return NextResponse.json({ error: "ID dan nama jabatan fungsional wajib diisi." }, { status: 400 });
  }

  const existing = await queryOne("SELECT id FROM functional_positions WHERE id = ?", [id]);
  if (existing) {
    return NextResponse.json({ error: "ID jabatan fungsional ini sudah ada." }, { status: 409 });
  }

  await execute("INSERT INTO functional_positions (id, name, job_class_id) VALUES (?, ?, ?)", [
    id,
    name,
    jobClassId,
  ]);
  return NextResponse.json({ functionalPosition: { id, name, job_class_id: jobClassId } }, { status: 201 });
}
