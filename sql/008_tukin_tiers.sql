-- Fase 6b: tier persentase potongan telat/pulang cepat jadi admin-editable (sebelumnya
-- hardcode di lib/tukin.ts). 4 baris tetap, admin cuma edit nilainya -- pola sama seperti
-- work_hour_rules.
CREATE TABLE IF NOT EXISTS tukin_deduction_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  max_minutes INT NULL,
  percent DECIMAL(5,2) NOT NULL,
  sort_order INT NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tukin_deduction_tiers (max_minutes, percent, sort_order) VALUES
  (30, 0.5, 1),
  (60, 1.0, 2),
  (90, 1.25, 3),
  (NULL, 1.5, 4)
ON DUPLICATE KEY UPDATE max_minutes = VALUES(max_minutes), percent = VALUES(percent);
