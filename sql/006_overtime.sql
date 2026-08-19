-- Fase 5: Lembur. `peserta` CSV di cobakinerja (tabel `lembur`) dinormalisasi jadi
-- junction table asli di sini -- satu event lembur bisa punya banyak pegawai peserta.
CREATE TABLE IF NOT EXISTS overtime_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  legacy_id_lembur INT NULL UNIQUE,
  event_date DATE NOT NULL,
  hours DECIMAL(4,1) NOT NULL,
  purpose TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS overtime_participants (
  overtime_event_id INT NOT NULL,
  employee_id CHAR(36) NOT NULL,
  PRIMARY KEY (overtime_event_id, employee_id),
  CONSTRAINT fk_overtime_participants_event
    FOREIGN KEY (overtime_event_id) REFERENCES overtime_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_overtime_participants_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_overtime_events_date ON overtime_events (event_date);
CREATE INDEX idx_overtime_participants_employee ON overtime_participants (employee_id);
