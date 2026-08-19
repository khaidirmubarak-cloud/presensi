-- Fase 6: Tukin. Kolom nominal yang sengaja di-drop dari job_classes/tukin_nonpns_grades
-- saat Fase 1 (belum dibutuhkan waktu itu) ditambahkan kembali di sini.
ALTER TABLE job_classes ADD COLUMN base_amount DECIMAL(12,2) NULL;
ALTER TABLE tukin_nonpns_grades ADD COLUMN base_amount DECIMAL(12,2) NULL;

-- cobakinerja: h_tube. Aktif dipakai (26 baris per 2025-08) tapi tidak pernah punya UI
-- admin sama sekali di cobakinerja (diedit langsung lewat database).
CREATE TABLE IF NOT EXISTS study_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  legacy_id_tube INT NULL UNIQUE,
  employee_id CHAR(36) NOT NULL,
  type ENUM('tube1', 'tube2') NOT NULL,
  start_date DATE NULL,
  status ENUM('aktif', 'selesai') NOT NULL DEFAULT 'aktif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_study_assignments_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_study_assignments_employee ON study_assignments (employee_id);

-- Satu baris konfigurasi global (id selalu 1) -- persentase potongan tukin untuk hari
-- kerja tanpa data presensi sama sekali dan tanpa cuti disetujui ("alpa").
CREATE TABLE IF NOT EXISTS tukin_settings (
  id TINYINT PRIMARY KEY,
  alpa_deduction_percent DECIMAL(5,2) NOT NULL DEFAULT 3.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tukin_settings (id, alpa_deduction_percent) VALUES (1, 3.00);

-- cobakinerja: tukin (histori bulanan). Rumus baru, tidak dimigrasikan dari histori lama
-- (tiga implementasi rumus lama tidak konsisten satu sama lain -- lihat README).
CREATE TABLE IF NOT EXISTS tukin_calculations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  period CHAR(7) NOT NULL,
  base_amount DECIMAL(12,2) NOT NULL,
  deduction_percent DECIMAL(6,2) NOT NULL,
  deduction_amount DECIMAL(12,2) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tukin_calculations (employee_id, period),
  CONSTRAINT fk_tukin_calculations_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_tukin_calculations_period ON tukin_calculations (period);
