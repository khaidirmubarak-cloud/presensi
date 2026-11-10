import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";
import { normalizePhoneNumber } from "../../../../../../lib/phone";

export const dynamic = "force-dynamic";

// Nomor WhatsApp pegawai untuk mengirim LKH lewat WA (endpoint terpisah dari PATCH profil
// ../route.ts supaya tidak ikut tertimpa saat admin menyimpan form data kepegawaian).
// Sejak login dashboard hanya lewat akun SIAKAD/Google, nomor WA BUKAN lagi alat login --
// pegawai biasanya menghubungkannya sendiri (kartu "Hubungkan WhatsApp" di dashboard-kinerja).
// Untuk admin: mengisi nomor = langsung aktif (status 'active', webhook menerima laporan dari
// nomor itu), mengosongkan = nonaktifkan pengiriman LKH lewat WA (status 'pending').
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const phoneRaw = typeof body?.phone_number === "string" ? body.phone_number.trim() : "";

  const phoneNumber = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;
  if (phoneNumber && (phoneNumber.length < 9 || phoneNumber.length > 15)) {
    return NextResponse.json({ error: "Nomor WhatsApp tidak valid." }, { status: 400 });
  }

  const existing = await queryOne<{ id: string }>("SELECT id FROM employees WHERE id = ?", [params.id]);
  if (!existing) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  if (phoneNumber) {
    const phoneTaken = await queryOne<{ id: string }>(
      "SELECT id FROM employees WHERE phone_number = ? AND id != ?",
      [phoneNumber, params.id],
    );
    if (phoneTaken) {
      return NextResponse.json({ error: "Nomor WhatsApp ini sudah dipakai pegawai lain." }, { status: 409 });
    }
  }

  const status = phoneNumber ? "active" : "pending";
  try {
    await execute("UPDATE employees SET phone_number = ?, status = ? WHERE id = ?", [phoneNumber, status, params.id]);
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui nomor WhatsApp pegawai." }, { status: 500 });
  }

  return NextResponse.json({ akun: { phone_number: phoneNumber, status }, reset: false });
}
