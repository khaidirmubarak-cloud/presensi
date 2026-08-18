-- =========================================================
-- Fase 1: Data Pegawai & Master Data
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
-- Aman dijalankan ulang: semua CREATE TABLE pakai IF NOT EXISTS, ALTER TABLE dicek manual
-- (lihat catatan di bawah) supaya tidak error kalau kolomnya sudah pernah ditambahkan.
-- =========================================================

-- 1. employees (tabel existing, shared dengan dashboard-kinerja) -- tambah satu kolom saja.
-- Nullable + unique, murni aditif: tidak mempengaruhi query existing dashboard-kinerja
-- yang selalu pakai daftar kolom eksplisit (lihat app/api/admin/employees/route.ts di
-- repo itu), bukan `SELECT *`.
ALTER TABLE employees ADD COLUMN finger_id INT NULL UNIQUE
  COMMENT 'ID pegawai di mesin fingerprint (cobakinerja user.id_finger). Dipakai fase Presensi nanti.';

-- 2. Tabel referensi/klasifikasi -- kode + nama saja, TANPA kolom nominal uang (lihat
-- Context di rencana Fase 1: nominal tukin/uang-makan sengaja dilempar ke fase Tukin/Uang
-- Makan supaya bisa didesain bertanggal-efektif, bukan kolom statis seperti di cobakinerja).

CREATE TABLE IF NOT EXISTS ranks (                       -- cobakinerja: golongan
  id VARCHAR(2) PRIMARY KEY,
  code VARCHAR(10) NOT NULL,                              -- nama_golongan, mis. 'III/b'
  title VARCHAR(50) NOT NULL                              -- pangkat, mis. 'Penata Muda Tingkat I'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS satker (                       -- cobakinerja: satker (1 baris sumber)
  id CHAR(3) PRIMARY KEY,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS units (                        -- cobakinerja: unit
  id VARCHAR(6) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  satker_id CHAR(3) NULL,
  head_employee_id CHAR(36) NULL,                         -- id_kepala
  CONSTRAINT fk_units_satker FOREIGN KEY (satker_id) REFERENCES satker(id),
  CONSTRAINT fk_units_head FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_classes (                  -- cobakinerja: kelas (kolom tukin di-drop)
  id INT PRIMARY KEY,
  name VARCHAR(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS functional_positions (         -- cobakinerja: fungsional
  id VARCHAR(3) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  job_class_id INT NULL,
  CONSTRAINT fk_functional_positions_job_class FOREIGN KEY (job_class_id) REFERENCES job_classes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tukin_nonpns_grades (          -- cobakinerja: tukin_nonpns (kolom tukin di-drop)
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL                               -- 'Supir', 'Satpam', 'Petugas Klinik', dst.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. employee_profiles -- inti Fase 1, 1:1 dengan employees.
CREATE TABLE IF NOT EXISTS employee_profiles (
  employee_id CHAR(36) PRIMARY KEY,
  legacy_id_user VARCHAR(6) NULL UNIQUE,       -- cobakinerja user.id_user, audit/rollback migrasi
  legacy_id_pegawai INT NULL,

  nip_lama VARCHAR(21) NULL,
  nidn VARCHAR(10) NULL,
  bank_account_no VARCHAR(20) NULL,            -- norek_peg
  npwp VARCHAR(20) NULL,
  birth_date DATE NULL,                        -- tgl_lahir
  photo_url VARCHAR(255) NULL,

  rank_id VARCHAR(2) NULL,
  unit_id VARCHAR(6) NULL,
  job_class_id INT NULL,
  functional_position_id VARCHAR(3) NULL,
  tukin_nonpns_grade_id INT NULL,
  position_title VARCHAR(150) NULL,            -- jabatan
  position_effective_date DATE NULL,           -- tmt_jabatan
  rank_effective_date DATE NULL,               -- tmt_pangkat
  service_years TINYINT NULL,                  -- tahun_mk
  service_months TINYINT NULL,                 -- bulan_mk
  retirement_date DATE NULL,                   -- tmt_pensiun

  employee_category VARCHAR(20) NULL,          -- nilai apa adanya, bukan enum DB: PNS|CPNS|NONPNS|Dosen TNP|PPPK|PPPK PW|DOKTER|DRIVER|Labschool|SECURITY|KLINIK|MUWAJJIH|MAGANG (lihat app/admin/pegawai/[id]/page.tsx)
  employment_status VARCHAR(20) NOT NULL DEFAULT 'aktif',  -- dari blokir: 'T'->aktif, 'Y'->nonaktif
  is_pegawai TINYINT(1) NULL,
  is_dosen TINYINT(1) NULL,
  is_serdos TINYINT(1) NULL,
  lecturer_type VARCHAR(2) NULL,               -- jenis_dosen
  uses_shift TINYINT(1) NULL,
  gets_meal_allowance TINYINT(1) NOT NULL DEFAULT 1,
  tukin_grade INT NULL,                        -- grade_tukin mentah

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_employee_profiles_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_employee_profiles_rank FOREIGN KEY (rank_id) REFERENCES ranks(id),
  CONSTRAINT fk_employee_profiles_unit FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT fk_employee_profiles_job_class FOREIGN KEY (job_class_id) REFERENCES job_classes(id),
  CONSTRAINT fk_employee_profiles_functional_position FOREIGN KEY (functional_position_id) REFERENCES functional_positions(id),
  CONSTRAINT fk_employee_profiles_tukin_nonpns_grade FOREIGN KEY (tukin_nonpns_grade_id) REFERENCES tukin_nonpns_grades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
