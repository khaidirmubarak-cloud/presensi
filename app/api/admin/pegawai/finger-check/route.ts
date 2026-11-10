import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/auth";
import { getFingerInfo, parseFingerId } from "../../../../../lib/finger";

export const dynamic = "force-dynamic";

// Cek sebuah ID finger sebelum disimpan: sudah dipakai siapa, kapan scan terakhirnya.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fingerId = parseFingerId(req.nextUrl.searchParams.get("finger_id"));
  if (fingerId === null || fingerId === "invalid") {
    return NextResponse.json({ error: "ID finger harus berupa angka bulat positif." }, { status: 400 });
  }
  return NextResponse.json({ info: await getFingerInfo(fingerId) });
}
