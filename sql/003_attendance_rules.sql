-- =========================================================
-- Fase 3: Presensi (dashboard admin + status otomatis)
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
-- attendance_pings & employees TIDAK diubah -- dipakai apa adanya (shared table).
-- =========================================================

CREATE TABLE IF NOT EXISTS work_hour_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  day_type ENUM('weekday','friday') NOT NULL,   -- weekday = Senin-Kamis
  period_type ENUM('normal','ramadhan') NOT NULL,
  check_in_time TIME NOT NULL,
  check_out_time TIME NOT NULL,
  UNIQUE KEY uq_work_hour_rules (day_type, period_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sebelumnya hardcoded di cobakinerja/config/hitung.php -- dipindah jadi data supaya bisa
-- diubah admin lewat /admin/master/jam-kerja kalau ada SK baru, tanpa deploy kode.
INSERT INTO work_hour_rules (day_type, period_type, check_in_time, check_out_time) VALUES
  ('weekday', 'normal',   '07:30:00', '16:00:00'),
  ('friday',  'normal',   '07:30:00', '16:30:00'),
  ('weekday', 'ramadhan', '08:00:00', '15:00:00'),
  ('friday',  'ramadhan', '08:00:00', '15:30:00')
ON DUPLICATE KEY UPDATE check_in_time = VALUES(check_in_time), check_out_time = VALUES(check_out_time);
