import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// Sesi aplikasi ini SENGAJA terpisah dari sesi dashboard-kinerja (cookie beda nama,
// SESSION_SECRET beda) walau keduanya login dengan kredensial employees yang sama --
// dua domain/subdomain berbeda tidak bisa berbagi cookie browser, dan mencampur secret
// akan membuat token dari satu app valid tanpa sengaja di app lain.
export const SESSION_COOKIE_NAME = "presensi_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

export type SessionPayload = {
  employeeId: string;
  name: string;
  phoneNumber: string;
  role: string;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
