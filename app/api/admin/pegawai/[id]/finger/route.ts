import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";
import { getFingerInfo, parseFingerId } from "../../../../../../lib/finger";

export const dynamic = "force-dynamic";

// Simpan/kosongkan ID finger pegawai. employees.finger_id UNIQUE -- ID yang sudah dipakai
// pegawai lain ditolak dengan menyebut pemakainya, supaya admin memutuskan sendiri siapa
// yang benar (kosongkan dulu di pegawai lain), bukan dipindah diam-diam.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const fingerId = parseFingerId(body?.finger_id);
  if (fingerId === "invalid") {
    return NextResponse.json({ error: "ID finger harus berupa angka bulat positif." }, { status: 400 });
  }

  const employee = await queryOne<{ id: string }>("SELECT id FROM employees WHERE id = ?", [params.id]);
  if (!employee) return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });

  if (fingerId !== null) {
    const other = await queryOne<{ name: string; nip: string | null }>(
      "SELECT name, nip FROM employees WHERE finger_id = ? AND id <> ?",
      [fingerId, params.id],
    );
    if (other) {
      return NextResponse.json(
        {
          error: `ID finger ${fingerId} sudah dipakai ${other.name}${other.nip ? ` (NIP ${other.nip})` : ""}. Kosongkan dulu ID finger di pegawai tersebut bila memang salah.`,
        },
        { status: 409 },
      );
    }
  }

  try {
    await execute("UPDATE employees SET finger_id = ? WHERE id = ?", [fingerId, params.id]);
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan ID finger (mungkin baru saja dipakai pegawai lain)." }, { status: 409 });
  }

  return NextResponse.json({ finger_id: fingerId, info: fingerId !== null ? await getFingerInfo(fingerId) : null });
}
