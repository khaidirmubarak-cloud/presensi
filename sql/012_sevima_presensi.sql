-- =========================================================
-- Pengakuan presensi aplikasi Sevima per pegawai.
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
--
-- WAJIB dijalankan SEBELUM deploy kode presensi maupun dashboard-kinerja versi ini: semua
-- query scan (SCAN_EMPLOYEE_JOIN di presensi/lib/finger.ts & dashboard-kinerja/lib/attendance.ts)
-- membaca kolom ini -- tanpa kolom ini halaman presensi/tukin/uang makan/LKH akan error.
--
-- 0 (default) = scan source 'SEVIMA' milik pegawai ini TIDAK dihitung dan tidak ditarik.
-- 1 = diakui admin kepegawaian: ditarik dari Sevima dan dihitung seperti scan mesin.
-- Aman dijalankan ulang.
-- =========================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS sevima_presensi_allowed TINYINT(1) NOT NULL DEFAULT 0;
