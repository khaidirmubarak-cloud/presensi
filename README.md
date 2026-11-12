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
| 6 | Tunjangan Kinerja (Tukin) | `/admin/tukin` -- kalkulasi bulanan (nominal kelas jabatan/grade non-ASN dipotong sesuai telat/pulang cepat/cuti/alpa). Mesin hitung cobakinerja ternyata punya **tiga rumus paralel yang saling tidak konsisten**; sistem baru pakai SATU rumus konsisten, keputusan kebijakan dikonfirmasi user: basis potongan cuti pakai `leave_types.tukin_deduction_percent` (bukan kategori hardcode legacy yang ternyata tidak pernah dipakai kode manapun), Dokter/Klinik dikecualikan total dari potongan (kebijakan resmi), Tugas Belajar TUBE1/TUBE2 (`/admin/master/tugas-belajar`, dulu tanpa UI sama sekali di cobakinerja) override potongan flat 0%/50%. Total potongan di-cap 100%, nominal diterima di-floor minimal 0 (perbaikan dari legacy yang bisa teoritis negatif). Data lembur Fase 5 **tidak** dipakai di sini -- dikonfirmasi lewat riset, cobakinerja sendiri tidak pernah mengaitkan lembur ke tukin. **Fase 6b**: halaman detail harian per pegawai (`/admin/tukin/[employeeId]`, rincian Terlambat/PSW/Tanpa Keterangan/Lainnya/Total per tanggal, gaya sama seperti laporan "Data Kehadiran" cobakinerja) + tier potongan telat/pulang cepat dan persentase alpa dipindah dari hardcode ke `/admin/master/potongan-tukin` (admin-editable, bisa tambah/hapus tier). **Fase 6c**: potongan awal dosen serdos -- basis tukin dosen `is_serdos=1` dikurangi gaji pokok (golongan x masa kerja, data master baru `/admin/master/gaji-pokok`, migrasi dari tabel `gaji` cobakinerja) sebelum potongan % dihitung, persis alur `laptukin.php`. `employee_profiles.is_serdos`/`.service_years`/`.rank_id` sudah lengkap sejak Fase 1, jadi tidak perlu migrasi data pegawai baru |
| 7 | Uang Makan | `/admin/uang-makan` -- kalkulasi bulanan: jumlah hari hadir (termasuk jenis cuti/izin yang ditandai `counts_toward_meal_allowance` di menu Jenis Cuti, mis. SP/EA dari cobakinerja) dikali nominal per Golongan (`/admin/master/golongan`, kolom baru "Uang Makan"/"Pajak"), dipotong pajak. Beda dari Tukin, formula cobakinerja di sini **konsisten** (satu rumus, dipakai sama untuk laporan PNS maupun PPPK). Eligibility per pegawai (`gets_meal_allowance`) dan basis golongan (`rank_id`) sudah lengkap sejak Fase 1, jadi migrasi Fase 7 cuma nominal per golongan + flag 2 jenis cuti -- tidak ada data per-pegawai yang perlu disentuh |

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

Migrasi uang makan (Fase 7 -- `golongan.um`/`golongan.pajak` jadi nominal per golongan,
`leave_types` SP/EA ditandai `counts_toward_meal_allowance`; tidak ada data per-pegawai
yang dimigrasikan di sini, lihat catatan di `scripts/migrate-uang-makan-from-cobakinerja.ts`):
```bash
npm run migrate:uang-makan
```

Migrasi gaji pokok (Fase 6c -- `gaji` jadi `salary_scales`, dipakai potongan awal dosen
serdos di Tukin; tidak ada data per-pegawai yang dimigrasikan, lihat catatan di
`scripts/migrate-gaji-pokok-from-cobakinerja.ts`):
```bash
npm run migrate:gaji-pokok
```

## 2b. Migrasi delta (catch-up data baru dari cobakinerja setelah migrasi awal)

Selama app lama (`http://36.88.112.181/cobakinerja`) masih live berdampingan dengan app baru,
data di sana (pegawai baru/berubah, cuti/izin, scan fingerprint) terus bertambah. Supaya
data di produksi "nyambung" (tidak ada gap), cukup **jalankan ulang 4 script migrasi yang
sama** (`migrate:cobakinerja` -> `migrate:calendar` -> `migrate:fingerprint` ->
`migrate:leave`, urutan ini penting karena `employees` jadi rujukan tabel lain) -- semuanya
idempotent (`INSERT IGNORE`/upsert by legacy id), jadi aman dijalankan berkali-kali, cuma
baris baru/berubah yang masuk, tidak akan dobel.

**1. Buka 2 tunnel SSH** (biarkan kedua terminal ini tetap terbuka selama proses):

Terminal A -- tunnel ke database `cobakinerja` (VPS lama, pola sama seperti
`~/Documents/GitHub/import-presensi-app/README.md`):
```bash
ssh -p 1212 -L 13306:127.0.0.1:3306 root@36.88.253.86 -N
```
Terminal B -- tunnel ke database produksi (lewat cPanel, pakai SSH key yang sudah dikonfigurasi
sebagai host `lkh-cpanel` di `~/.ssh/config`):
```bash
ssh -L 13307:127.0.0.1:3306 lkh-cpanel -N
```

**2. Backup database produksi dulu** (jaring pengaman sebelum menulis ke produksi):
```bash
ssh lkh-cpanel '~/apps/kinerja/scripts/backup.sh'
```
Script ini (repo `kinerja`, lihat `kinerja/README.md` §9) mem-backup database + file dokumentasi ke
`~/backups/` di server, mengambil kredensial DB otomatis dari env Setup Node.js App -- tidak perlu
mengetik password. Pastikan outputnya diakhiri "Backup selesai" sebelum lanjut.

**3. Buat file env sementara** (jangan pernah commit, hapus lagi setelah selesai), isi
`DB_*` mengarah ke tunnel Terminal B dan `SOURCE_DB_*` ke tunnel Terminal A:
```
DB_HOST=127.0.0.1
DB_PORT=13307
DB_USER=lkhuinplp_app
DB_PASSWORD=<password produksi>
DB_NAME=lkhuinplp_db

SOURCE_DB_HOST=127.0.0.1
SOURCE_DB_PORT=13306
SOURCE_DB_USER=root
SOURCE_DB_PASSWORD=<password mysql root VPS lama>
SOURCE_DB_NAME=cobakinerja
```

**4. Load env lalu jalankan ke-4 perintah secara urut** (di terminal ketiga, folder repo ini):
```bash
set -a && source /tmp/migrate-delta.env && set +a
npm run migrate:cobakinerja
npm run migrate:calendar
npm run migrate:fingerprint
npm run migrate:leave
```
`migrate:fingerprint` paling lama (scan ulang seluruh histori ~1,5 juta baris lewat tunnel,
bisa beberapa menit) -- yang lain cepat.

**5. Beres-beres**: tutup kedua tunnel (`Ctrl+C` di Terminal A & B), hapus file env
sementara (`rm /tmp/migrate-delta.env`, isinya password).

Tidak perlu jalankan `migrate:lembur`/`migrate:tukin`/`migrate:uang-makan`/`migrate:gaji-pokok`
untuk catch-up rutin -- itu migrasi master data satu kali (Fase 5-7), bukan data transaksional
yang terus bertambah di app lama.

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

## 4. Pengelolaan pegawai & akun login (pusat)

Semua pengelolaan pegawai dan akun login dilakukan di sini (`/admin/pegawai`) -- dipindah dari
dashboard-kinerja, yang sekarang khusus dashboard laporan kinerja harian:

- **Tambah pegawai** (nama + NIP) atau **Sync dari Sevima** (`POST /api/admin/pegawai/sync-sevima`,
  `lib/sevima.ts`). Sync hanya menambah NIP baru dengan status akun `pending`, tidak pernah
  menimpa pegawai yang sudah ada. Butuh env `SEVIMA_API_URL`, `SEVIMA_APP_KEY`,
  `SEVIMA_SECRET_KEY` di Setup Node.js App presensi (header `X-App-Key`/`X-Secret-Key`). **IP
  server harus terdaftar di whitelist Sevima** -- kalau belum, sync gagal 502 (Sevima merespons
  403). Presensi dan dashboard-kinerja jalan di server cPanel yang sama, jadi IP yang sudah
  di-whitelist untuk dashboard-kinerja tetap berlaku.
- **Akun login** di halaman detail pegawai (`PATCH /api/admin/pegawai/[id]/akun`): nomor
  WhatsApp + status klaim. Mengubah nomor pada akun yang sudah aktif = reset ke `pending`
  dan nomor dikosongkan (pegawai wajib klaim ulang lewat WA, mencegah admin mengambil alih
  akun ke nomor lain). Pegawai tetap mengaktifkan akun sendiri lewat "Klaim akun" /
  aktivasi di dashboard-kinerja -- `password_hash`/`registration_token*` tidak pernah ditulis
  dari app ini.
- **Hapus pegawai** (`DELETE /api/admin/pegawai/[id]`) hanya untuk data salah input yang belum
  punya riwayat: ditolak kalau sudah ada `daily_reports`/`attendance_pings` (FK keduanya
  `ON DELETE SET NULL`, jadi tanpa cek ini laporan kinerja akan diam-diam kehilangan
  pemiliknya) atau data lain yang ber-FK (cuti, tukin, uang makan, RHK). Pegawai yang
  berhenti/pindah cukup diset Nonaktif.

## 5. Pegawai ganda & NIP kotor (`npm run fix:pegawai-ganda`)

NIP dari cobakinerja ada yang membawa karakter tak terlihat / encoding rusak (mis. `â€Œ1987…`,
sisa U+200C yang tersimpan dobel-encode). Sync Sevima dulu mencocokkan NIP secara persis, sehingga
pegawai yang sama dibuatkan baris kedua tanpa data kepegawaian. Sejak `lib/nip.ts`, NIP selalu
dibersihkan (hanya huruf & angka) di sync Sevima (juga cocok lewat NIDN/NIP lama), tambah/edit
pegawai, migrasi cobakinerja, dan login SIAKAD/Google di dashboard-kinerja.

Untuk membereskan data yang sudah terlanjur ganda, jalankan dari laptop dengan env `DB_*` ke
database produksi (tunnel seperti §2b):
```bash
ssh lkh-cpanel '~/apps/kinerja/scripts/backup.sh'   # backup dulu
npm run fix:pegawai-ganda              # DRY RUN: laporan saja, tidak mengubah apa pun
npm run fix:pegawai-ganda -- --apply   # eksekusi setelah daftar dry run diperiksa
```
Setiap kelompok NIP ganda dengan tepat satu baris cobakinerja: baris cobakinerja dipertahankan,
semua data yang merujuk ke baris lain (tabel dideteksi otomatis dari foreign key: laporan,
presensi WA, RHK, email login, kode WA, cuti, dst.) dipindah, ID finger & nomor WA dipindah bila
baris cobakinerja belum punya, lalu baris lain dihapus — satu transaksi per kelompok. Kelompok
lain dilaporkan untuk dicek manual. Aman dijalankan ulang. Setelah itu, tekan "Sync dari Sevima".

**Dosen dengan NIDN di kolom NIP Sevima.** Di Sevima `/dosen`, field `nip` ±72% dosen berisi NIDN
(NIP resmi kadang di `nip_pns`). Sync kini mencocokkan semua identitas Sevima (nip, nip_pns, nidn,
nidk) ke NIP / NIDN / NIP lama pegawai, dan menyimpan pegawai baru dengan `nip_pns` bila ada.
`fix:pegawai-ganda` juga menggabungkan baris yang NIP-nya sama dengan **NIDN/NIP lama di profil**
baris cobakinerja. Pasangan yang tidak tersambung lewat nomor apa pun (mis. NIDN di cobakinerja
kosong) muncul di bagian **"Kemungkinan ganda berdasarkan nama"** — tidak digabung otomatis. Untuk
menggabungkannya: isi **NIDN** di detail pegawai cobakinerja (sama dengan NIP baris Sevima), lalu
jalankan `fix:pegawai-ganda` lagi.

Karena NIDN di profil cobakinerja umumnya kosong, sebagian besar pasangan dosen hanya bisa
dikenali lewat nama. `npm run fix:pegawai-ganda-nama` (dry run; `-- --csv=/tmp/daftar.csv` untuk
daftar lengkap di spreadsheet; `-- --apply` untuk eksekusi) menggabungkan otomatis HANYA pasangan
yang aman: nama (tanpa gelar) cocok dengan tepat satu baris cobakinerja dan sebaliknya, NIDN
cobakinerja kosong/sama, dan bukan dua NIP 18 digit berbeda. NIDN dari baris Sevima disimpan ke
profil cobakinerja supaya sync berikutnya langsung cocok. Sisanya dilaporkan MANUAL beserta
kandidatnya (isi NIDN di detail pegawai yang benar, lalu `fix:pegawai-ganda`).

**Akun tidak aktif di Sevima.** Sync hanya mengimpor akun berstatus Aktif (`id_status_aktif = AA`);
akun Tidak Aktif / Meninggal Dunia / Pensiun tidak membuat pegawai baru dan emailnya tidak
dihubungkan (satu orang bisa punya akun lama yang tidak aktif). Pegawai di sistem yang hanya cocok
dengan akun tidak aktif ditampilkan di hasil sync untuk ditinjau admin (hapus bila duplikat tanpa
data, atau ubah Status kepegawaian menjadi Nonaktif) — sync tidak mengubahnya otomatis.

## 6. Dosen kontrak / LB tidak dikelola (`npm run fix:hapus-dosen-lb`)

Dosen kontrak/luar biasa di Sevima memakai NIP berawalan `LB` (±429 dari 716 data `/dosen`). Mereka
tidak diperhitungkan di presensi, tunjangan kinerja, maupun uang makan, dan tidak memakai LKH.
`EXCLUDED_NIP_PREFIXES` di `lib/nip.ts` membuat sync Sevima melewati NIP tersebut (termasuk email
loginnya). Baris LB yang terlanjur diimpor dibersihkan dengan script (dry run dulu, env `DB_*`
seperti §5):
```bash
npm run fix:hapus-dosen-lb              # DRY RUN
npm run fix:hapus-dosen-lb -- --apply   # eksekusi, setelah backup
```
Baris LB tanpa data apa pun (dan bukan dari cobakinerja) dihapus; yang punya laporan/presensi/RHK/
cuti/tukin atau berasal dari cobakinerja dijadikan **Nonaktif** (keluar dari presensi, tukin, uang
makan, dan tidak bisa login LKH) supaya riwayatnya tidak kehilangan pemilik. Akun admin tidak
disentuh.

## Catatan penting

- Kolom akun login di `employees` (`phone_number`, `status`) hanya ditulis lewat endpoint
  akun di atas, terpisah dari form data kepegawaian. Semua field HR/payroll disimpan di
  `employee_profiles` dan tabel referensi (`ranks`, `units`, `job_classes`,
  `functional_positions`, `tukin_nonpns_grades`, `satker`).
- Kolom nominal uang (tukin/uang makan) sengaja TIDAK dimodelkan di Fase 1 -- ditambahkan
  belakangan di Fase 6 (`job_classes.base_amount`, `tukin_nonpns_grades.base_amount`) dan
  Fase 7 (`ranks.meal_amount`, `ranks.meal_tax_percent`).
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
