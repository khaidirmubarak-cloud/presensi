import type { Metadata } from "next";
import "./globals.css";

// Sama seperti dashboard-kinerja: semua halaman butuh session cookie, tidak ada
// untungnya di-prerender statis saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presensi & Kepegawaian",
  description: "Data pegawai, master data, dan presensi UIN Palopo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="font-body text-ink antialiased">{children}</body>
    </html>
  );
}
