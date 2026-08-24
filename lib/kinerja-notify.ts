// Jembatan ke service WA/media di repo terpisah ~/Documents/GitHub/kinerja (server/app.js),
// yang dijalankan sendiri dan dipanggil lewat endpoint /internal/* berpelindung shared
// secret. Pola & nama helper sama persis dengan dashboard-kinerja/app/api/reports/route.ts
// (uploadMediaToKinerja) supaya konsisten lintas app yang berbagi service ini.

const MEDIA_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB -- samakan dengan kinerja/server/media.js
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/jpg"];

export function validateDocumentFile(file: File): string | null {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return "Dokumen harus berformat PDF atau JPG.";
  }
  if (file.size > MEDIA_MAX_SIZE_BYTES) {
    return "Ukuran dokumen maksimal 5MB.";
  }
  return null;
}

export async function uploadDocumentToKinerja(employeeId: string, file: File): Promise<string> {
  const forwardBody = new FormData();
  forwardBody.set("employeeId", employeeId);
  forwardBody.set("file", file);

  const res = await fetch(process.env.KINERJA_UPLOAD_MEDIA_URL!, {
    method: "POST",
    headers: { "x-internal-secret": process.env.KINERJA_INTERNAL_SECRET! },
    body: forwardBody,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Gagal mengunggah dokumen.");
  }
  return data.url as string;
}

// false pada kegagalan apa pun (nomor di luar jendela 24 jam WA, service tidak
// tercapai, dll) -- pemanggil tidak boleh anggap ini fatal untuk operasi utamanya.
export async function sendKetidakhadiranNotification(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const res = await fetch(process.env.KINERJA_SEND_NOTIFICATION_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.KINERJA_INTERNAL_SECRET!,
      },
      body: JSON.stringify({ phone_number: phoneNumber, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
