# Presensi & Kepegawaian

Fondasi pengganti `cobakinerja`, dibangun bertahap per fase (lihat
`/Users/macbook/.claude/plans/nested-popping-cake.md` untuk rencana fase yang sedang/baru
dikerjakan -- file itu ditimpa tiap fase baru, jadi roadmap lengkap dan sudah-selesai
dicatat di sini, bukan di sana).

## Roadmap

### Selesai & live di produksi

| Fase | Nama | Catatan |
|---|---|---|
| 1 | Data Pegawai & Master Data | 543 pegawai + golongan/unit/jabatan/grade non-ASN dimigrasikan dari cobakinerja |
| 2 | Hari Libur & Kalender Kerja | 248 hari libur + periode Ramadhan; jumlah hari kerja dihitung otomatis, bukan diketik manual seperti `harikerja` cobakinerja |
| 3 | Presensi (dashboard admin) | `/admin/presensi` -- status otomatis (Hadir/Terlambat/Pulang Cepat) dari `attendance_pings` (WA-ping, sudah aktif diisi webhook `kinerja`/`dashboard-kinerja`) dibanding `work_hour_rules` (normal vs Ramadhan) |
| 3b | Presensi Fingerprint | `fingerprint_scans` (1,47 juta baris riwayat) jadi **sumber utama** presensi, WA-ping jadi fallback -- lihat "Kontrak `fingerprint_scans`" di bawah. Juga diretrofit ke `dashboard-kinerja` (dashboard pegawai `lkh.uinpalopo.ac.id`) + fitur detail presensi bulanan per pegawai di sini |
| 4 | Ketidakhadiran (Cuti/Izin) | `/admin/ketidakhadiran`, admin-only -- 18.342 riwayat cuti + 29 jenis cuti dimigrasikan dari `ijin`/`status`. Cuti disetujui otomatis mengubah status presensi hari itu jadi "Cuti" (menang atas shift/ping/fingerprint, kalah dari akhir pekan/hari libur) |
| 5 | Lembur | `/admin/lembur`, admin-only, tanpa alur approval (sama seperti modul `lembur` cobakinerja). `peserta` CSV di cobakinerja dinormalisasi jadi tabel junction `overtime_participants`. **Tidak ada data historis dimigrasikan** -- tabel `lembur` sudah tidak ada sama sekali di database live cobakinerja saat fase ini dikerjakan (2026-08), kemungkinan fitur itu sudah lama rusak diam-diam di sana |
| 6 | Tukin | `/admin/tukin` -- kalkulasi bulanan (nominal kelas jabatan/grade non-ASN dipotong sesuai telat/pulang cepat/cuti/alpa). Mesin hitung cobakinerja ternyata punya **tiga rumus paralel yang saling tidak konsisten**; sistem baru pakai SATU rumus konsisten, keputusan kebijakan dikonfirmasi user: basis potongan cuti pakai `leave_types.tukin_deduction_percent` (bukan kategori hardcode legacy yang ternyata tidak pernah dipakai kode manapun), Dokter/Klinik dikecualikan total dari potongan (kebijakan resmi), Tugas Belajar TUBE1/TUBE2 (`/admin/master/tugas-belajar`, dulu tanpa UI sama sekali di cobakinerja) override potongan flat 0%/50%. Total potongan di-cap 100%, nominal diterima di-floor minimal 0 (perbaikan dari legacy yang bisa teoritis negatif). Serdos dosen bersertifikasi **ditunda** (lihat di bawah). Data lembur Fase 5 **tidak** dipakai di sini -- dikonfirmasi lewat riset, cobakinerja sendiri tidak pernah mengaitkan lembur ke tukin. **Fase 6b**: halaman detail harian per pegawai (`/admin/tukin/[employeeId]`, rincian Terlambat/PSW/Tanpa Keterangan/Lainnya/Total per tanggal, gaya sama seperti laporan "Data Kehadiran" cobakinerja) + tier potongan telat/pulang cepat dan persentase alpa dipindah dari hardcode ke `/admin/master/potongan-tukin` (admin-editable, konsisten dengan pola aturan bisnis lain di aplikasi ini) |

### Belum dikerjakan

| Fase | Nama | Catatan |
|---|---|---|
| 7 | Uang Makan | Belum dimulai |
| - | Tukin dosen bersertifikasi (serdos) | Basis tukin dosen serdos di cobakinerja dikurangi nominal tunjangan profesi (tabel `gaji`/`masa_kerja`/`golongan`, belum pernah dimigrasikan sama sekali) -- ditunda dari Fase 6 karena scope migrasi data tambahan yang besar |

### Sengaja ditunda (bukan bagian urutan utama)

- **Self-service pengajuan cuti/izin** oleh pegawai sendiri (form di `dashboard-kinerja`) --
  saat ini admin-only.
- **Jembatan sinkron mesin fingerprint real-time** -- kontrak tabel sudah didokumentasikan
  ("Kontrak `fingerprint_scans`" di bawah), tinggal tool sinkron milik user diarahkan ke sana.
- **Jadwal shift satpam** -- pegawai `uses_shift=1` masih dikecualikan dari perhitungan
  status presensi otomatis (sama seperti perilaku cobakinerja lama).
- **Cetak Surat Tugas Lembur & Daftar Hadir Kerja Lembur** -- cobakinerja generate dua
  dokumen ini dari data lembur (ada nama pejabat penandatangan hard-coded). Fase 5 di sini
  cuma CRUD data, cetak surat ditunda ke fase terpisah.
- **Cetak slip tukin / rekap tukin per unit** -- cobakinerja punya beberapa varian laporan
  cetak (`laprekaptukin*.php`). Fase 6 di sini cuma tabel hasil di admin, belum ada versi
  cetak/export.

Next.js (App Router, TS) + MariaDB, berbagi database yang sama dengan `dashboard-kinerja`
dan `kinerja` (bukan database baru) -- codebase terpisah, deploy ke subdomain sendiri
(mis. `presensi.uinpalopo.ac.id`), memperluas pola yang sudah dipakai kedua repo itu.

## 1. Coba di komputer lokal dulu

Butuh akses ke database MariaDB yang sama dengan `dashboard-kinerja` (lokal atau lewat
tunnel ke VPS produksi -- JANGAN jalankan skema/migrasi terhadap database produksi
sebelum diuji di salinan/scratch DB dulu, lihat bagian Verifikasi di rencana Fase 1).

```bash
npm install
```

Buat `.env` di root folder ini (lihat `.env.example`):
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=<user-mariadb>
DB_PASSWORD=<password-mariadb>
DB_NAME=<nama-database-sama-dengan-dashboard-kinerja>
SESSION_SECRET=<string-acak-panjang-beda-dari-dashboard-kinerja>
APP_URL=http://localhost:3000
```

Jalankan skema Fase 1 & 2 (aman dijalankan ulang -- `CREATE TABLE IF NOT EXISTS`, `ALTER
TABLE ADD COLUMN` di baris pertama `001` perlu dicek manual sekali saja supaya tidak error
kalau kolomnya sudah pernah ditambahkan):
```bash
mariadb -u <user> -p <database> < sql/001_employee_profiles.sql
mariadb -u <user> -p <database> < sql/002_calendar.sql
mariadb -u <user> -p <database> < sql/003_attendance_rules.sql
mariadb -u <user> -p <database> < sql/004_fingerprint_scans.sql
mariadb -u <user> -p <database> < sql/005_leave.sql
```

```bash
npm run dev
```
Buka http://localhost:3000 -- login pakai kredensial `employees` yang sama dengan
dashboard-kinerja (nomor WhatsApp + password), akun harus `role='admin'`.

## 2. Migrasi data dari cobakinerja (sekali jalan)

Isi juga `SOURCE_DB_*` di `.env` (lihat `.env.example`) -- mengarah ke database
`cobakinerja` (lewat SSH tunnel ke VPS lama, sama seperti pola di
`~/Documents/GitHub/import-presensi-app/README.md`, atau ke salinan lokal dump-nya).

```bash
npm run migrate:cobakinerja
```

Aman dijalankan ulang: tabel referensi pakai `INSERT IGNORE`, pegawai dicocokkan by NIP
dan **tidak pernah** menimpa `phone_number`/`password_hash`/`status`/`registration_token`
pada baris `employees` yang sudah ada (klaim akun WA tetap aman disentuh).

Migrasi kalender (Fase 2 -- `libur`/`ramadhan`/`harikerja`), pakai env yang sama:
```bash
npm run migrate:calendar
```

Migrasi historis fingerprint (Fase 3b -- `absen`, ~1,2 juta baris, butuh waktu lebih lama
dari migrasi lain, ada log progres per bulan):
```bash
npm run migrate:fingerprint
```

Migrasi ketidakhadiran (Fase 4 -- `status`/`ijin`; `ijin_detail` sengaja tidak dimigrasi,
lihat catatan di `scripts/migrate-leave-from-cobakinerja.ts`):
```bash
npm run migrate:leave
```

Migrasi lembur (Fase 5 -- `lembur`): tabel sumbernya sudah tidak ada di database live
cobakinerja saat fase ini dikerjakan, jadi script ini ada tapi tidak pernah benar-benar
memindahkan data apa pun di produksi:
```bash
npm run migrate:lembur
```

Migrasi tukin (Fase 6 -- `kelas.tukin`/`tukin_nonpns.tukin` jadi nominal dasar,
`h_tube` jadi `study_assignments`; histori kalkulasi lama di tabel `tukin` **tidak**
dimigrasikan, lihat catatan di `scripts/migrate-tukin-from-cobakinerja.ts`):
```bash
npm run migrate:tukin
```

## Kontrak `fingerprint_scans` (untuk tool sinkron mesin fingerprint)

`absen` di cobakinerja **tidak diisi oleh kode PHP manapun** (dikonfirmasi: cuma ada fitur
koreksi manual per pegawai) -- mesin fingerprint tersambung ke database lewat tool/software
terpisah di luar codebase ini. Sejak cobakinerja tidak dipakai lagi, tool itu diarahkan
untuk menulis langsung ke tabel berikut di **database yang sama dengan app ini**
(`sql/004_fingerprint_scans.sql`):

```sql
INSERT INTO fingerprint_scans (finger_id, scanned_at, source) VALUES (?, ?, ?)
```
- `finger_id` -- ID pegawai di mesin (harus cocok dengan `employees.finger_id`, lihat Fase 1).
- `scanned_at` -- **WAJIB UTC**, bukan waktu lokal WITA. Jam mesin fingerprint biasanya
  waktu lokal (WITA, UTC+8) -- tool sinkron harus **mengurangi 8 jam** dari jam yang dibaca
  mesin sebelum insert. Seluruh app ini disiplin UTC di semua tabel waktu (sama seperti
  `attendance_pings`); kalau kolom ini ditulis WITA apa adanya, semua status presensi bakal
  geser 8 jam. Bug ini sempat kejadian saat migrasi data historis dari `absen` (yang memang
  WITA apa adanya di cobakinerja) -- sudah diperbaiki di
  `scripts/migrate-fingerprint-from-cobakinerja.ts`, jadi migrasi historis aman; ini cuma
  soal jalur tool sinkron baru yang menulis langsung.
- `source` -- bebas, dipakai buat audit (mis. `'MESIN'`).
- Jangan ubah nama tabel/3 kolom ini tanpa koordinasi ulang dengan konfigurasi tool sinkron.

## 3. Deploy ke VPS (cPanel)

Sama seperti `dashboard-kinerja` -- "Setup Node.js App" terpisah, subdomain sendiri,
`output: "standalone"` + `postbuild` menyalin `.next/static`, env var lewat UI cPanel
(arahkan `DB_HOST/PORT/USER/PASSWORD/NAME` ke database **yang sama** dengan
dashboard-kinerja). Lihat `dashboard-kinerja/README.md` §2 untuk detail langkah &
gotcha redeploy (`node_modules` bisa ter-reset setelah `git pull`).

## Catatan penting

- Endpoint admin di sini tidak pernah menulis `employees.phone_number`/`password_hash`/
  `status`/`registration_token*` -- kolom-kolom itu domain klaim-akun WA milik
  `dashboard-kinerja`. Semua field HR/payroll baru disimpan di `employee_profiles` dan
  tabel referensi (`ranks`, `units`, `job_classes`, `functional_positions`,
  `tukin_nonpns_grades`, `satker`).
- Kolom nominal uang (tukin/uang makan) sengaja TIDAK dimodelkan di fase ini -- lihat
  rencana Fase 1 untuk alasannya. Fase Tukin/Uang Makan nanti FK balik ke tabel
  referensi di sini.
- Login di app ini cuma untuk `role='admin'` (lihat `middleware.ts`) -- belum ada
  halaman untuk pegawai biasa di fase ini.
- Jumlah hari kerja per bulan dihitung otomatis (`lib/calendar.ts`, hari kerja Senin-Jumat
  dikurangi `holidays`), bukan diketik manual seperti `harikerja` di `cobakinerja`.
  `historical_work_day_counts` cuma arsip baca-saja dari data lama, tidak dipakai
  aplikasi.
- `fingerprint_scans` adalah sumber utama presensi (lihat "Kontrak `fingerprint_scans`" di
  atas), `attendance_pings` (WA) cuma dipakai kalau hari itu tidak ada scan mesin sama
  sekali. `fingerprint_scans.finger_id` sengaja **tanpa FK keras** ke `employees` supaya
  scan baru dari tool sinkron tidak pernah ditolak insert-nya.
