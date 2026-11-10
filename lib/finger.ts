import { queryOne, dbDatetimeToIso } from "./db";

// Info satu ID finger mesin presensi: siapa pemakainya di employees, dan aktivitas scannya
// di fingerprint_scans -- dipakai halaman detail pegawai untuk menampilkan, mengecek
// sebelum menyimpan, dan menyelesaikan bentrok ID finger (mis. hasil migrasi cobakinerja).
// ID finger hanya berasal dari cobakinerja (user.id_finger) atau diisi admin -- data Sevima
// tidak punya ID finger.

export type FingerInfo = {
  fingerId: number;
  owner: { id: string; name: string; nip: string | null } | null;
  lastScanAt: string | null; // ISO UTC
  scans30d: number;
};

export function parseFingerId(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) return "invalid";
  return n;
}

export async function getFingerInfo(fingerId: number): Promise<FingerInfo> {
  const [owner, scan] = await Promise.all([
    queryOne<{ id: string; name: string; nip: string | null }>(
      "SELECT id, name, nip FROM employees WHERE finger_id = ?",
      [fingerId],
    ),
    queryOne<{ last_scan: string | null; scans_30d: number }>(
      `SELECT MAX(scanned_at) AS last_scan,
              SUM(scanned_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS scans_30d
       FROM fingerprint_scans WHERE finger_id = ?`,
      [fingerId],
    ),
  ]);
  return {
    fingerId,
    owner: owner ?? null,
    lastScanAt: dbDatetimeToIso(scan?.last_scan ?? null),
    scans30d: Number(scan?.scans_30d ?? 0),
  };
}
