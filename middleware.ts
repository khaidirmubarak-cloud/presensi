import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "./lib/auth";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PATHS = ["/api/login", "/api/logout"];

// Sama seperti dashboard-kinerja: nginx cPanel duduk sebagai reverse proxy cache di
// depan Passenger, tanpa header ini response per-pegawai bisa ke-cache dan disajikan
// ulang ke request berikutnya.
function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_API_PATHS.includes(pathname)) {
    return withNoStore(NextResponse.next());
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return withNoStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    return withNoStore(NextResponse.redirect(new URL("/login", req.url)));
  }

  // Fase ini (Data Pegawai & Master Data) murni permukaan admin -- belum ada halaman
  // untuk role pegawai biasa, jadi seluruh area non-publik digate admin-only.
  if (session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return withNoStore(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    return withNoStore(NextResponse.redirect(new URL("/login", req.url)));
  }

  return withNoStore(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
