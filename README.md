# Presensi & Kepegawaian

Fase 1: Data Pegawai & Master Data. Fase 2: Hari Libur & Kalender Kerja -- fondasi
pengganti `cobakinerja` (lihat `/Users/macbook/.claude/plans/nested-popping-cake.md`
untuk rencana Fase 2).

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
