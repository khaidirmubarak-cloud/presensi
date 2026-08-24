import { NextRequest, NextResponse } from "next/server";
import { execute } from "../../../../../lib/db";
import { getSession } from "../../../../../lib/auth";
import { validateDocumentFile, uploadDocumentToKinerja } from "../../../../../lib/kinerja-notify";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = ["pengajuan", "disetujui", "ditolak"];

// PATCH dipakai untuk Setujui/Tolak (JSON, cuma { status }) maupun edit penuh dari form
// (multipart/form-data, karena bisa sekalian ganti dokumen).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fields: string[] = [];
  const values: any[] = [];
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    const employeeId = String(formData.get("employee_id") ?? "").trim();
    const leaveTypeId = String(formData.get("leave_type_id") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "").trim();
    const endDate = String(formData.get("end_date") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const statusInput = String(formData.get("status") ?? "");
    const file = formData.get("file");
    const documentFile = file instanceof File && file.size > 0 ? file : null;

    if (statusInput) {
      if (!ALLOWED_STATUS.includes(statusInput)) {
        return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
      }
      fields.push("status = ?");
      values.push(statusInput);
    }
    if (employeeId) {
      fields.push("employee_id = ?");
      values.push(employeeId);
    }
    if (leaveTypeId) {
      fields.push("leave_type_id = ?");
      values.push(leaveTypeId);
    }
    if (startDate) {
      fields.push("start_date = ?");
      values.push(startDate);
    }
    if (endDate) {
      fields.push("end_date = ?");
      values.push(endDate);
    }
    fields.push("reason = ?");
    values.push(reason || null);

    if (documentFile) {
      const fileError = validateDocumentFile(documentFile);
      if (fileError) {
        return NextResponse.json({ error: fileError }, { status: 400 });
      }
      if (!process.env.KINERJA_UPLOAD_MEDIA_URL || !process.env.KINERJA_INTERNAL_SECRET) {
        console.error(
          "KINERJA_UPLOAD_MEDIA_URL/KINERJA_INTERNAL_SECRET belum diisi di env server presensi.",
        );
        return NextResponse.json(
          { error: "Upload dokumen belum dikonfigurasi di server (env KINERJA_UPLOAD_MEDIA_URL/KINERJA_INTERNAL_SECRET kosong)." },
          { status: 500 },
        );
      }
      if (!employeeId) {
        return NextResponse.json({ error: "Pegawai wajib diisi untuk mengganti dokumen." }, { status: 400 });
      }
      try {
        const documentUrl = await uploadDocumentToKinerja(employeeId, documentFile);
        fields.push("document_url = ?");
        values.push(documentUrl);
      } catch (err) {
        console.error("Upload dokumen ketidakhadiran gagal:", err);
        return NextResponse.json(
          { error: err instanceof Error ? `Gagal mengunggah dokumen: ${err.message}` : "Gagal mengunggah dokumen." },
          { status: 502 },
        );
      }
    }
  } else {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    if (body.status !== undefined) {
      if (!ALLOWED_STATUS.includes(body.status)) {
        return NextResponse.json({ error: "Status tidak valid." }, { status: 400 });
      }
      fields.push("status = ?");
      values.push(body.status);
    }
    if (body.leave_type_id !== undefined) {
      fields.push("leave_type_id = ?");
      values.push(String(body.leave_type_id).trim());
    }
    if (body.start_date !== undefined) {
      fields.push("start_date = ?");
      values.push(String(body.start_date).trim());
    }
    if (body.end_date !== undefined) {
      fields.push("end_date = ?");
      values.push(String(body.end_date).trim());
    }
    if (body.reason !== undefined) {
      fields.push("reason = ?");
      values.push(String(body.reason).trim() || null);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
  }

  const result = await execute(
    `UPDATE leave_requests SET ${fields.join(", ")} WHERE id = ?`,
    [...values, params.id],
  );
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Pengajuan cuti tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await execute("DELETE FROM leave_requests WHERE id = ?", [params.id]);
  if (result.affectedRows === 0) {
    return NextResponse.json({ error: "Pengajuan cuti tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
