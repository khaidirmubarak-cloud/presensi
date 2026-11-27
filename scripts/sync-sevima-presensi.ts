// Tarik presensi aplikasi Sevima ke fingerprint_scans untuk rentang tanggal (backfill),
// memakai logika yang sama dengan tombol di halaman Presensi (lib/sevima-presensi.ts).
// HARUS dijalankan di server yang IP-nya ada di whitelist API Sevima.
//
// Jalankan: npm run sync:sevima-presensi -- 2026-11-01 2026-11-27 [--dry-run]
// Env: DB_*, SEVIMA_API_URL, SEVIMA_APP_KEY, SEVIMA_SECRET_KEY (opsional SEVIMA_CONCURRENCY)

import { listDates, syncSevimaPresensi, todayWita } from "../lib/sevima-presensi";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const from = args[0] || todayWita();
  const to = args[1] || from;
  const all = listDates(from, to);
  if (!all) throw new Error("Format: npm run sync:sevima-presensi -- YYYY-MM-DD [YYYY-MM-DD] [--dry-run]");

  // Per tanggal supaya progres terlihat dan kegagalan di tengah tidak membuang yang sudah masuk.
  for (const date of all) {
    const r = await syncSevimaPresensi([date], { dryRun });
    console.log(
      `${date}: ${r.pegawaiDicek} pegawai, ${r.recordAdaJam} record berjam, ` +
        `${r.jamBaru} jam ${dryRun ? "akan " : ""}ditambah, ${r.jamSudahAda} sudah ada, ` +
        `${r.dilewatiDekatScanMesin} dilewati (dekat scan mesin), ${r.barisLamaDihapus} koreksi dihapus, ${r.gagal} gagal`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
