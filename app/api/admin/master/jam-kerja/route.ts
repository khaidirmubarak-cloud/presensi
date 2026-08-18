import { NextResponse } from "next/server";
import { query } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Hanya 4 baris tetap (weekday/friday x normal/ramadhan), diseed lewat sql/003 -- tanpa
// POST, cukup edit lewat [id]/route.ts (PATCH).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rules = await query(
    "SELECT id, day_type, period_type, check_in_time, check_out_time FROM work_hour_rules ORDER BY period_type, day_type",
  );
  return NextResponse.json({ rules });
}
