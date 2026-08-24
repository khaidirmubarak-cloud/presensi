import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, nowDbDatetime } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth";
import { validateDocumentFile, uploadDocumentToKinerja, sendKetidakhadiranNotification } from "../../../../lib/kinerja-notify";

export const dynamic = "force-dynamic";

const ALLOWED_PAGE_SIZES = [10, 50, 100];
const ALLOWED_STATUS = ["pengajuan", "disetujui", "ditolak"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const status = ALLOWED_STATUS.includes(searchParams.get("status") ?? "") ? searchParams.get("status") : "";
  const pageSize = ALLOWED_PAGE_SIZES.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 50;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: any[] = [];
  if (q) {
    conditions.push("(e.name LIKE ? OR e.nip LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status) {
    conditions.push("lr.status = ?");
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id ${where}`,
    params,
  );
  const total = countRow?.total ?? 0;

  const requests = await query(
    `SELECT lr.id, lr.employee_id, e.name AS employee_name, e.nip AS employee_nip,
            lr.leave_type_id, lt.name AS leave_type_name,
            lr.start_date, lr.end_date, lr.reason, lr.status,
            lr.document_url, lr.wa_notified_at
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     ${where}
     ORDER BY lr.start_date DESC, lr.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return NextResponse.json({ requests, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  const status = ALLOWED_STATUS.includes(statusInput) ? statusInput : "disetujui";
  const file = formData.get("file");
  const documentFile = file instanceof File && file.size > 0 ? file : null;

  if (!employeeId || !leaveTypeId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Pegawai, jenis cuti, tanggal mulai, dan tanggal selesai wajib diisi." },
      { status: 400 },
    );
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: "Tanggal mulai tidak boleh setelah tanggal selesai." }, { status: 400 });
  }
  if (documentFile) {
    const fileError = validateDocumentFile(documentFile);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }
  }

  const employee = await queryOne<{ id: string; name: string; phone_number: string | null; status: string }>(
    "SELECT id, name, phone_number, status FROM employees WHERE id = ?",
    [employeeId],
  );
  if (!employee) {
    return NextResponse.json({ error: "Pegawai tidak ditemukan." }, { status: 404 });
  }
  const leaveType = await queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM leave_types WHERE id = ?",
    [leaveTypeId],
  );
  if (!leaveType) {
    return NextResponse.json({ error: "Jenis cuti tidak ditemukan." }, { status: 404 });
  }

  let documentUrl: string | null = null;
  if (documentFile) {
    if (!process.env.KINERJA_UPLOAD_MEDIA_URL || !process.env.KINERJA_INTERNAL_SECRET) {
      console.error(
        "KINERJA_UPLOAD_MEDIA_URL/KINERJA_INTERNAL_SECRET belum diisi di env server presensi.",
      );
      return NextResponse.json(
        { error: "Upload dokumen belum dikonfigurasi di server (env KINERJA_UPLOAD_MEDIA_URL/KINERJA_INTERNAL_SECRET kosong)." },
        { status: 500 },
      );
    }
    try {
      documentUrl = await uploadDocumentToKinerja(employeeId, documentFile);
    } catch (err) {
      console.error("Upload dokumen ketidakhadiran gagal:", err);
      return NextResponse.json(
        { error: err instanceof Error ? `Gagal mengunggah dokumen: ${err.message}` : "Gagal mengunggah dokumen." },
        { status: 502 },
      );
    }
  }

  const result = await execute(
    `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status, document_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [employeeId, leaveTypeId, startDate, endDate, reason || null, status, documentUrl],
  );

  let waNotified = false;
  if (documentUrl && employee.phone_number && employee.status === "active") {
    const dateLabel = startDate === endDate ? startDate : `${startDate} s/d ${endDate}`;
    const message =
      `Halo ${employee.name}, Anda tercatat "${leaveType.name}" pada ${dateLabel}.\n` +
      `Keterangan: ${reason || "-"}\n` +
      `Dokumen: ${documentUrl}`;
    waNotified = await sendKetidakhadiranNotification(employee.phone_number, message);
    if (waNotified) {
      await execute("UPDATE leave_requests SET wa_notified_at = ? WHERE id = ?", [
        nowDbDatetime(),
        result.insertId,
      ]);
    }
  }

  return NextResponse.json(
    {
      leaveRequest: { id: result.insertId, document_url: documentUrl },
      wa_notified: waNotified,
    },
    { status: 201 },
  );
}
