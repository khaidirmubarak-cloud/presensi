import { NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Hanya 4 baris tetap (tier menit telat/pulang cepat), diseed lewat sql/008 -- tanpa
// POST, cukup edit lewat [id]/route.ts (PATCH). Pola sama seperti jam-kerja.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tiers = await query("SELECT id, max_minutes, percent, sort_order FROM tukin_deduction_tiers ORDER BY sort_order");
  return NextResponse.json({ tiers });
}
