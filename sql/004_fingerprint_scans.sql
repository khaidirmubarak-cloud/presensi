-- =========================================================
-- Fase 3b: Presensi Fingerprint
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
--
-- Tabel ini adalah KONTRAK untuk tool sinkron mesin fingerprint (di luar codebase ini) --
-- tool tsb tinggal INSERT INTO fingerprint_scans (finger_id, scanned_at, source)
-- VALUES (...) per scan baru. Jangan ubah nama tabel/3 kolom itu tanpa koordinasi ulang
-- dengan konfigurasi tool sinkronnya. Lihat README.md bagian "Kontrak fingerprint_scans".
-- =========================================================

CREATE TABLE IF NOT EXISTS fingerprint_scans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  finger_id INT NOT NULL,              -- employees.finger_id -- TANPA FK keras: scan bisa
                                        -- merujuk id_finger lama yang sudah tidak ter-assign
                                        -- ke pegawai manapun, FK keras berisiko menolak scan
                                        -- baru dari tool sinkron.
  scanned_at DATETIME NOT NULL,        -- UTC
  source VARCHAR(20) NOT NULL DEFAULT 'MESIN',  -- MESIN|ANDROID|PUSAKA|MANUAL (arsip dari cobakinerja.absen.status)
  legacy_id_pegawai INT NULL,          -- cobakinerja absen.id_pegawai, audit migrasi historis saja
  UNIQUE KEY uq_fingerprint_scans (finger_id, scanned_at),
  KEY idx_fingerprint_scans_scanned_at (scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
