import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "../../../lib/db";
import { signSession, setSessionCookie, verifyPassword } from "../../../lib/auth";
import { normalizePhoneNumber } from "../../../lib/phone";

export const dynamic = "force-dynamic";

// Login pakai kredensial employees yang sama dengan dashboard-kinerja (phone_number +
// password_hash) -- aplikasi ini tidak punya alur klaim-akun/registrasi sendiri, itu
// tetap milik dashboard-kinerja. Hanya role='admin' yang bisa masuk (lihat middleware.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phoneRaw = typeof body?.phone_number === "string" ? body.phone_number.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  // Bug ditemukan lewat percobaan login nyata: tanpa normalisasi ini, nomor yang diketik
  // user (mis. "0812...") tidak cocok exact-match dengan yang tersimpan di DB (mis.
  // "6281234567890", format yang dipakai wa-webhook & dashboard-kinerja) -- selalu jatuh
  // ke "Nomor atau password salah" walau kredensialnya benar.
  const phoneNumber = phoneRaw ? normalizePhoneNumber(phoneRaw) : "";

  if (!phoneNumber || !password) {
    return NextResponse.json(
      { error: "Nomor WhatsApp dan password wajib diisi." },
      { status: 400 },
    );
  }

  const employee = await queryOne<{
    id: string;
    name: string;
    phone_number: string;
    password_hash: string | null;
    status: string;
    role: string;
  }>(
    "SELECT id, name, phone_number, password_hash, status, role FROM employees WHERE phone_number = ?",
    [phoneNumber],
  );

  if (!employee || employee.status !== "active" || !employee.password_hash) {
    return NextResponse.json({ error: "Nomor atau password salah." }, { status: 401 });
  }

  if (employee.role !== "admin") {
    return NextResponse.json(
      { error: "Akun ini tidak punya akses ke aplikasi kepegawaian." },
      { status: 403 },
    );
  }

  const valid = await verifyPassword(password, employee.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Nomor atau password salah." }, { status: 401 });
  }

  const token = await signSession({
    employeeId: employee.id,
    name: employee.name,
    phoneNumber: employee.phone_number,
    role: employee.role,
  });
  setSessionCookie(token);

  return NextResponse.json({ message: "Login berhasil.", name: employee.name });
}
