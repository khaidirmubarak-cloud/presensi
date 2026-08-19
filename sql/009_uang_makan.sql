-- Fase 7: Uang Makan. Nominal/pajak per golongan (dulu sengaja di-drop Fase 1, sama
-- alasan seperti job_classes/tukin_nonpns_grades) ditambahkan kembali di sini.
ALTER TABLE ranks ADD COLUMN meal_amount DECIMAL(10,2) NULL;
ALTER TABLE ranks ADD COLUMN meal_tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Jenis cuti/izin yang tetap dihitung "hadir" untuk uang makan (cobakinerja: SP & EA) --
-- admin-editable, bukan hardcode, lihat README.
ALTER TABLE leave_types ADD COLUMN counts_toward_meal_allowance TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS meal_allowance_calculations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  period CHAR(7) NOT NULL,
  eligible_days INT NOT NULL,
  rate_amount DECIMAL(10,2) NOT NULL,
  tax_percent DECIMAL(5,2) NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL,
  calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_meal_allowance (employee_id, period),
  CONSTRAINT fk_meal_allowance_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_meal_allowance_period ON meal_allowance_calculations (period);
