import type { Metadata } from "next";
import "./globals.css";

// Sama seperti dashboard-kinerja: semua halaman butuh session cookie, tidak ada
// untungnya di-prerender statis saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Presensi & Kepegawaian",
  description: "Data pegawai, master data, dan presensi UIN Palopo",
};

// Set data-theme SEBELUM paint pertama (blocking, bukan useEffect) supaya tidak kedip
// tema salah sesaat saat halaman dimuat -- localStorage dulu, baru prefers-color-scheme.
const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var stored = localStorage.getItem('theme');
      var theme = stored === 'dark' || stored === 'light'
        ? stored
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = theme;
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-body text-ink antialiased">{children}</body>
    </html>
  );
}
