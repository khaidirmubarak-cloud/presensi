/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Sama seperti dashboard-kinerja: VPS cPanel pakai CloudLinux LVE dengan limit NPROC
  // ketat, cpus:2 (-> 1 worker) menghindari spawn EAGAIN saat build tanpa memicu bug
  // "useContext on null" yang muncul kalau workernya dinolkan sama sekali.
  experimental: {
    cpus: 2,
    // pdfkit/exceljs memuat aset (font .afm, dll) lewat fs relatif ke paketnya sendiri
    // saat runtime -- kalau di-bundle webpack biasa gampang patah di route handler.
    serverComponentsExternalPackages: ["pdfkit", "exceljs"],
  },
};

module.exports = nextConfig;
