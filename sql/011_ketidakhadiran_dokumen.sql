-- =========================================================
-- Fase 11: Dokumen ketidakhadiran (mis. Surat Tugas dinas luar) + notifikasi WA
-- Dijalankan terhadap database MariaDB yang SAMA dengan dashboard-kinerja/kinerja.
-- =========================================================

ALTER TABLE leave_requests
  ADD COLUMN document_url VARCHAR(500) NULL,
  ADD COLUMN wa_notified_at DATETIME NULL;
