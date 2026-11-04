import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "../../../../../../lib/db";
import { getSession } from "../../../../../../lib/auth";
import { normalizePhoneNumber } from "../../../../../../lib/phone";

export const dynamic = "force-dynamic";

// Akun login pegawai (nomor WhatsApp + status klaim) -- dipindah dari dashboard-kinerja
// (app/api/admin/employees/[id] PATCH) supaya pengelolaan akun terpusat di sini. Sengaja
// endpoint terpisah dari PATCH profil (../route.ts): kolom akun punya aturan pengaman
// sendiri dan tidak boleh ikut tertimpa saat admin menyimpan form data kepegawaian.
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

  const existing = await queryOne<{ id: string; name: string; phone_number: string | null; status: string }>(
    "SELECT id, name, phone_number, status FROM employees WHERE id = ?",
    [params.id],
  );
  if (!existing) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }

  // Akun yang sudah aktif tidak boleh langsung dipindah ke nomor baru pilihan admin --
  // itu setara mengambil-alih akun tanpa pegawai bersangkutan membuktikan kepemilikan
  // nomor itu sendiri. Ubah nomor pada akun aktif = reset ke pending dengan nomor
  // dikosongkan, supaya pegawai wajib klaim ulang dari awal lewat WA (nomor baru yang
  // diketik admin sengaja diabaikan, bukan langsung disimpan).
  let finalPhoneNumber = phoneNumber;
  let finalStatus = existing.status;
  const wasReset = existing.status === "active" && phoneNumber !== existing.phone_number;

  if (wasReset) {
    finalPhoneNumber = null;
    finalStatus = "pending";
  } else if (phoneNumber) {
    const phoneTaken = await queryOne<{ id: string }>(
      "SELECT id FROM employees WHERE phone_number = ? AND id != ?",
      [phoneNumber, params.id],
    );
    if (phoneTaken) {
      return NextResponse.json({ error: "Nomor WhatsApp ini sudah dipakai pegawai lain." }, { status: 409 });
    }
  }

  try {
    await execute("UPDATE employees SET phone_number = ?, status = ? WHERE id = ?", [
      finalPhoneNumber,
      finalStatus,
      params.id,
    ]);
  } catch {
    return NextResponse.json({ error: "Gagal memperbarui akun pegawai." }, { status: 500 });
  }

  return NextResponse.json({
    akun: { phone_number: finalPhoneNumber, status: finalStatus },
    reset: wasReset,
  });
}
