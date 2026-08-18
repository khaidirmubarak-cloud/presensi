-- =========================================================
-- Fase 2: Hari Libur & Kalender Kerja
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
-- Semua CREATE TABLE pakai IF NOT EXISTS -- aman dijalankan ulang.
-- =========================================================

CREATE TABLE IF NOT EXISTS holidays (              -- cobakinerja: libur
  id INT AUTO_INCREMENT PRIMARY KEY,
  legacy_id_libur INT NULL UNIQUE,                  -- cobakinerja libur.id_libur, audit/rollback migrasi
  holiday_date DATE NOT NULL UNIQUE,
  description VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ramadhan_periods (       -- cobakinerja: ramadhan
  year YEAR PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Arsip saja -- angka lama diketik manual di cobakinerja (lihat harikerja/proses.php),
-- tidak dipakai lagi sebagai sumber kebenaran (lihat lib/calendar.ts). Disimpan untuk
-- rujukan/reproduksi tukin periode lama saja, tanpa CRUD UI.
CREATE TABLE IF NOT EXISTS historical_work_day_counts (  -- cobakinerja: harikerja
  period CHAR(6) PRIMARY KEY,                        -- 'YYYYMM'
  day_count TINYINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
