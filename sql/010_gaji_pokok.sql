-- Data referensi gaji pokok (golongan x masa kerja) -- cobakinerja: gaji. Dipakai untuk
-- menghitung "potongan awal" dosen serdos di Tukin (lihat lib/tukin.ts resolveSalaryScaleAmount).
CREATE TABLE IF NOT EXISTS salary_scales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rank_id VARCHAR(2) NOT NULL,
  years TINYINT NOT NULL,
  nominal DECIMAL(12,2) NOT NULL,
  UNIQUE KEY uq_salary_scales (rank_id, years),
  CONSTRAINT fk_salary_scales_rank FOREIGN KEY (rank_id) REFERENCES ranks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Integrasi Serdos ke Tukin: nilai tukin kelas jabatan mentah disimpan terpisah dari basis
-- potongan (yang sekarang bisa dikurangi potongan awal dulu untuk dosen serdos).
-- `base_amount` (kolom lama) sekarang berarti tunjangan kinerja SETELAH potongan awal --
-- itu basis yang benar dipakai potongan % telat/cuti/alpa, persis laptukin.php cobakinerja.
ALTER TABLE tukin_calculations ADD COLUMN job_class_amount DECIMAL(12,2) NULL;
ALTER TABLE tukin_calculations ADD COLUMN initial_deduction DECIMAL(12,2) NOT NULL DEFAULT 0;
