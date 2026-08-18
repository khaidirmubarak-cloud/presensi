-- =========================================================
-- Fase 4: Ketidakhadiran (Cuti/Izin)
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
-- =========================================================

CREATE TABLE IF NOT EXISTS leave_types (              -- cobakinerja: status
  id VARCHAR(2) PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  tukin_deduction_percent DECIMAL(5,2) NOT NULL DEFAULT 0,  -- potongan, dipakai Fase 6 (Tukin) nanti
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Header saja -- rentang tanggal, bukan materialized per-hari seperti cobakinerja
-- ijin_detail (lihat lib/attendance-status.ts: keterlibatan per-tanggal dihitung saat baca).
CREATE TABLE IF NOT EXISTS leave_requests (            -- cobakinerja: ijin
  id INT AUTO_INCREMENT PRIMARY KEY,
  legacy_id_ijin INT NULL UNIQUE,                       -- cobakinerja ijin.id_ijin, audit/rollback migrasi
  employee_id CHAR(36) NOT NULL,
  leave_type_id VARCHAR(2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NULL,
  status ENUM('pengajuan','disetujui','ditolak') NOT NULL DEFAULT 'pengajuan',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_requests_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_leave_requests_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_leave_requests_employee_dates ON leave_requests (employee_id, start_date, end_date);
