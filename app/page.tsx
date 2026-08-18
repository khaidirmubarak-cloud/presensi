import { redirect } from "next/navigation";

// Fase ini (Data Pegawai & Master Data) belum punya dashboard ringkasan -- halaman utama
// langsung ke pengelolaan pegawai, satu-satunya modul yang sudah ada.
export default function HomePage() {
  redirect("/admin/pegawai");
}
