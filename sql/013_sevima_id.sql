-- =========================================================
-- id_pegawai Sevima per pegawai -- kunci endpoint presensi-pegawai/{id_pegawai}-{tanggal}.
-- Diisi otomatis oleh "Sync dari Sevima" (menu Pegawai) dan saat penarikan presensi pertama
-- kali menemukan pegawai yang belum punya nilainya. Dengan kolom ini, menarik presensi satu
-- pegawai cukup satu permintaan ke Sevima, tanpa mengambil seluruh daftar pegawai Sevima
-- (yang memicu 429 "Too many requests").
--
-- WAJIB dijalankan SEBELUM deploy kode presensi versi ini. Aman dijalankan ulang.
-- =========================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS sevima_id INT NULL;
