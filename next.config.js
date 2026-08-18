/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Sama seperti dashboard-kinerja: VPS cPanel pakai CloudLinux LVE dengan limit NPROC
  // ketat, cpus:2 (-> 1 worker) menghindari spawn EAGAIN saat build tanpa memicu bug
  // "useContext on null" yang muncul kalau workernya dinolkan sama sekali.
  experimental: {
    cpus: 2,
  },
};

module.exports = nextConfig;
