// Client untuk API Sevima Siakad Cloud, dipakai admin untuk sinkronisasi data pegawai
// awal ke tabel employees (lihat app/api/admin/pegawai/sync-sevima/route.ts). Dipindah
// dari dashboard-kinerja -- pengelolaan akun pegawai sekarang terpusat di aplikasi ini.
//
// Dua sumber data terpisah — staf non-akademik di /pegawai, dosen di /dosen — dengan
// bentuk attributes yang sama. Field "nip" aman dipakai apa adanya di kedua endpoint:
// untuk dosen PNS isinya NIP asli, untuk dosen non-PNS otomatis berisi NIDN (karena
// mereka memang tidak punya NIP formal). "nip_pns" tidak konsisten terisi, jangan dipakai.
//
// Response BUKAN JSON:API standar walau bentuknya mirip — halaman berikutnya ada di
// "urls.next" (bukan "links.next"), dan total/halaman ada di "meta".

type SevimaAttributes = {
  id_pegawai: number;
  nip: string;
  nama: string;
  email?: string | null;
  email_kampus?: string | null;
};

type SevimaRecord = {
  type: string;
  id: number;
  attributes: SevimaAttributes;
};

type SevimaListResponse = {
  data: SevimaRecord[];
  urls?: { next?: string | null };
};

export type SevimaEmployee = {
  nip: string;
  name: string;
  // Dipakai untuk "Masuk dengan Google" di dashboard-kinerja (tabel employee_login_emails).
  email: string | null;
  emailKampus: string | null;
};

function cleanEmail(v: string | null | undefined): string | null {
  const e = v?.replace(ZERO_WIDTH_CHARS_RE, "").trim().toLowerCase();
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

// Karakter zero-width yang kadang nyelip di field "nama" Sevima (mis. U+200C sebelum
// nama), tidak dibuang oleh trim() biasa karena bukan whitespace — daftar eksplisit
// per-codepoint supaya tidak ada karakter tak-terlihat di source code ini sendiri.
const ZERO_WIDTH_CHARS_RE = /[\u200B\u200C\u200D\u200E\u200F\uFEFF]/g;

async function fetchSevimaResource(resourcePath: string): Promise<SevimaEmployee[]> {
  const baseUrl = process.env.SEVIMA_API_URL || "https://api.sevimaplatform.com";
  let url: string | null = `${baseUrl}${resourcePath}`;

  const employees: SevimaEmployee[] = [];

  while (url) {
    const res: Response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-App-Key": process.env.SEVIMA_APP_KEY!,
        "X-Secret-Key": process.env.SEVIMA_SECRET_KEY!,
      },
    });

    if (!res.ok) {
      throw new Error(`Sevima API (${resourcePath}) merespons ${res.status}`);
    }

    const body: SevimaListResponse = await res.json();

    for (const record of body.data ?? []) {
      const nip = record.attributes?.nip?.trim();
      const name = record.attributes?.nama?.replace(ZERO_WIDTH_CHARS_RE, "").trim();
      if (nip && name) {
        employees.push({
          nip,
          name,
          email: cleanEmail(record.attributes?.email),
          emailKampus: cleanEmail(record.attributes?.email_kampus),
        });
      }
    }

    url = body.urls?.next || null;
  }

  return employees;
}

export async function fetchSevimaEmployees(): Promise<SevimaEmployee[]> {
  const [pegawai, dosen] = await Promise.all([
    fetchSevimaResource("/siakadcloud/v1/pegawai"),
    fetchSevimaResource("/siakadcloud/v1/dosen"),
  ]);

  // Dedupe by NIP kalau-kalau ada orang yang muncul di kedua daftar (mis. dosen yang
  // juga tercatat sebagai pegawai struktural) — data /dosen menang kalau bentrok.
  const byNip = new Map<string, SevimaEmployee>();
  for (const emp of [...pegawai, ...dosen]) {
    byNip.set(emp.nip, emp);
  }

  return [...byNip.values()];
}
