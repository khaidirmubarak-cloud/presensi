import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { type AttendanceStatus, type AttendanceSource } from "./attendance-status";

// Replika layout "Daftar Hadir" legacy cobakinerja (cetak/lapbulanan.php, mode "Per
// Unit") -- riset langsung ke source PHP + tabel `global` (lihat plan). Kop surat, kode
// leave (SP/S/C.../I/DL), kolom rekap (SP/S/C/I/DL/TK/H/HK), dan tanda tangan semuanya
// meniru itu persis; grid ini menggantikan format daftar-harian-per-pegawai sebelumnya.

export type ExportEmployee = {
  id: string;
  name: string;
  nip: string | null;
  unitName: string | null;
  rankCode: string | null;
};

export type ExportDay = {
  date: string; // 'YYYY-MM-DD'
  status: AttendanceStatus;
  jamMasuk: string | null; // ISO
  jamPulang: string | null; // ISO
  sumber: AttendanceSource;
  telatMenit: number | null;
  pulangCepatMenit: number | null;
  leaveTypeId: string | null;
};

export type UnitGroup = {
  unitName: string; // "Tanpa Unit" kalau tidak ada
  employees: ExportEmployee[];
};

export type HolidayInfo = { date: string; description: string };
export type LeaveTypeInfo = { id: string; name: string };

const INDO_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${INDO_MONTHS[m - 1]} ${y}`;
}

function lastDateLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${daysInMonth} ${INDO_MONTHS[m - 1]} ${y}`;
}

function formatWita(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(":", ".");
}

type MonthSummary = { sp: number; s: number; c: number; i: number; dl: number; tk: number; h: number; hk: number };

function summarizeMonth(days: ExportDay[]): MonthSummary {
  const sum: MonthSummary = { sp: 0, s: 0, c: 0, i: 0, dl: 0, tk: 0, h: 0, hk: 0 };
  for (const day of days) {
    if (day.status === "cuti" && day.leaveTypeId) {
      const code = day.leaveTypeId;
      if (code === "SP") sum.sp++;
      else if (code === "S") sum.s++;
      else if (code.startsWith("C")) sum.c++;
      else if (code === "I") sum.i++;
      else if (code === "DL") sum.dl++;
    } else if (day.status === "belum_ada_data") {
      sum.tk++;
    }
    if (day.jamMasuk) sum.h++;
    if (day.status !== "libur") sum.hk++;
  }
  sum.h += sum.sp; // SP dihitung tetap "hadir" -- persis $hh = $ht+$hs+$sp di lapbulanan.php
  return sum;
}

// Kode yang tampil di sel tanggal (menggantikan jam) + kategori tampilan (untuk warna).
type CellKind = "normal" | "late" | "special" | "blank";

function cellKind(day: ExportDay): CellKind {
  if (day.status === "libur" || day.status === "shift") return "blank";
  if (day.status === "cuti" || day.status === "belum_ada_data") return "special";
  if (day.status === "terlambat" || day.status === "pulang_cepat") return "late";
  return "normal";
}

function cellText(day: ExportDay, row: "datang" | "pulang"): string {
  const kind = cellKind(day);
  if (kind === "blank") return "";
  if (kind === "special") return day.status === "cuti" ? day.leaveTypeId ?? "-" : "TK";
  return formatWita(row === "datang" ? day.jamMasuk : day.jamPulang);
}

const FILL: Record<CellKind, string | null> = {
  normal: null,
  late: "#D6F5F5",
  special: "#FFF3B0",
  blank: "#E8E8E8",
};

// --- PDF ---------------------------------------------------------------

const NO_W = 18;
const NAME_W = 128;
const GOL_W = 30;
const JAM_W = 46;
const SUM_W = 18;
const SUMMARY_LABELS = ["SP", "S", "C", "I", "DL", "TK", "H", "HK"] as const;
const ROW_H = 13;
const HEADER_H = 16;
// Ukuran font konsisten untuk semua tulisan di luar kop surat (kop tetap punya hierarki
// ukurannya sendiri -- nama instansi lebih besar dari alamat, dst).
const BASE_FONT = 9;

export async function buildAttendanceGridPdf(
  unitGroups: UnitGroup[],
  daysByEmployee: Map<string, ExportDay[]>,
  month: string,
  holidays: HolidayInfo[],
  cutiTypes: LeaveTypeInfo[],
): Promise<Buffer> {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const logoPath = path.join(process.cwd(), "assets", "logo-uin-palopo.jpg");
  const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A3", layout: "landscape", margin: 24 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;

    // Kolom tanggal melar mengisi sisa lebar kertas A3 landscape sampai ke ujung kanan --
    // jumlah hari beda tiap bulan (28-31), jadi lebarnya dihitung dari sisa ruang, bukan
    // angka tetap (supaya bulan 28 hari pun tetap penuh ke kanan, bukan nyisa kosong).
    const fixedWidth = NO_W + NAME_W + GOL_W + JAM_W + SUMMARY_LABELS.length * SUM_W;
    const DATE_W = (right - left - fixedWidth) / daysInMonth;

    function drawKop() {
      const top = doc.y;
      if (logoBuffer) doc.image(logoBuffer, left, top, { width: 64 });
      doc.font("Helvetica-Bold").fontSize(12);
      doc.text("KEMENTERIAN AGAMA REPUBLIK INDONESIA", left + 76, top, { width: right - left - 76, align: "center" });
      doc.text("UNIVERSITAS ISLAM NEGERI", left + 76, doc.y, { width: right - left - 76, align: "center" });
      doc.fontSize(14).text("PALOPO", left + 76, doc.y, { width: right - left - 76, align: "center" });
      doc.font("Helvetica").fontSize(8);
      doc.text("Kampus 1 Jalan Agatis Kel. Balandai Kec. Bara Kota Palopo Sulawesi Selatan 91914", left + 76, doc.y, {
        width: right - left - 76,
        align: "center",
      });
      doc.text("email: kontak@uinpalopo.ac.id  website https://uinpalopo.ac.id", left + 76, doc.y, {
        width: right - left - 76,
        align: "center",
      });
      doc.y = Math.max(doc.y, top + 68);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(2).strokeColor("#000000").stroke();
      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").fontSize(BASE_FONT + 2).text("DAFTAR HADIR", left, doc.y);
      doc.font("Helvetica").fontSize(BASE_FONT).text(`Bulan : ${monthLabel(month)}`, left, doc.y);
      doc.moveDown(1.5);
    }

    function colX(index: number): number {
      // index: 0=No,1=Nama,2=Gol,3=Jam,4..(4+daysInMonth-1)=tanggal,lalu 8 kolom ringkasan
      const widths = [NO_W, NAME_W, GOL_W, JAM_W, ...Array(daysInMonth).fill(DATE_W), ...Array(SUMMARY_LABELS.length).fill(SUM_W)];
      let x = left;
      for (let i = 0; i < index; i++) x += widths[i];
      return x;
    }

    function drawColumnHeader() {
      const top = doc.y;
      const row1H = HEADER_H;
      const row2H = HEADER_H;
      doc.lineWidth(0.5).strokeColor("#000000");
      doc.font("Helvetica-Bold").fontSize(BASE_FONT);

      function mergedHeader(index: number, width: number, text: string) {
        const x = colX(index);
        doc.rect(x, top, width, row1H + row2H).stroke();
        doc.text(text, x + 1, top + row1H / 2, { width: width - 2, align: "center" });
      }
      mergedHeader(0, NO_W, "No");
      mergedHeader(1, NAME_W, "Nama / NIP");
      mergedHeader(2, GOL_W, "Gol");
      mergedHeader(3, JAM_W, "Jam");

      const tanggalX = colX(4);
      const tanggalW = daysInMonth * DATE_W;
      doc.rect(tanggalX, top, tanggalW, row1H).stroke();
      doc.text("TANGGAL", tanggalX, top + 4, { width: tanggalW, align: "center" });
      for (let d = 1; d <= daysInMonth; d++) {
        const x = colX(4 + d - 1);
        doc.rect(x, top + row1H, DATE_W, row2H).stroke();
        doc.text(String(d), x, top + row1H + 4, { width: DATE_W, align: "center" });
      }

      const sumX = colX(4 + daysInMonth);
      const sumW = SUMMARY_LABELS.length * SUM_W;
      doc.rect(sumX, top, sumW, row1H).stroke();
      doc.text("Jumlah", sumX, top + 4, { width: sumW, align: "center" });
      SUMMARY_LABELS.forEach((label, i) => {
        const x = colX(4 + daysInMonth + i);
        doc.rect(x, top + row1H, SUM_W, row2H).stroke();
        doc.text(label, x, top + row1H + 4, { width: SUM_W, align: "center" });
      });

      doc.y = top + row1H + row2H;
      doc.font("Helvetica").fontSize(BASE_FONT);
    }

    function ensureSpace(height: number) {
      if (doc.y + height > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawColumnHeader();
      }
    }

    function drawEmployeeRows(no: number, emp: ExportEmployee, days: ExportDay[], summary: MonthSummary) {
      const top = doc.y;
      doc.lineWidth(0.4).strokeColor("#999999").font("Helvetica").fontSize(BASE_FONT);

      function spanCell(index: number, width: number, text: string) {
        const x = colX(index);
        doc.rect(x, top, width, ROW_H * 2).stroke();
        doc.text(text, x + 2, top + ROW_H - 3, { width: width - 4, align: "center" });
      }
      spanCell(0, NO_W, String(no));
      const x1 = colX(1);
      doc.rect(x1, top, NAME_W, ROW_H * 2).stroke();
      doc.text(emp.name, x1 + 2, top + 2, { width: NAME_W - 4, height: ROW_H * 2 - 4, ellipsis: true });
      doc.text(emp.nip ?? "-", x1 + 2, top + ROW_H + 4, { width: NAME_W - 4 });
      spanCell(2, GOL_W, emp.rankCode ?? "-");

      const jamX = colX(3);
      doc.rect(jamX, top, JAM_W, ROW_H).stroke();
      doc.text("DATANG", jamX + 1, top + 3, { width: JAM_W - 2, align: "center", lineBreak: false });
      doc.rect(jamX, top + ROW_H, JAM_W, ROW_H).stroke();
      doc.text("PULANG", jamX + 1, top + ROW_H + 3, { width: JAM_W - 2, align: "center", lineBreak: false });

      for (let d = 1; d <= days.length; d++) {
        const day = days[d - 1];
        const kind = cellKind(day);
        const fill = FILL[kind];
        const x = colX(4 + d - 1);
        if (fill) {
          doc.rect(x, top, DATE_W, ROW_H * 2).fillAndStroke(fill, "#999999");
        } else {
          doc.rect(x, top, DATE_W, ROW_H * 2).stroke();
        }
        doc.fillColor("#000000");
        doc.text(cellText(day, "datang"), x, top + 3, { width: DATE_W, align: "center", lineBreak: false });
        doc.text(cellText(day, "pulang"), x, top + ROW_H + 3, { width: DATE_W, align: "center", lineBreak: false });
      }

      const values = [summary.sp, summary.s, summary.c, summary.i, summary.dl, summary.tk, summary.h, summary.hk];
      values.forEach((v, i) => {
        const x = colX(4 + days.length + i);
        doc.rect(x, top, SUM_W, ROW_H * 2).stroke();
        doc.text(String(v), x, top + ROW_H - 3, { width: SUM_W, align: "center" });
      });

      doc.y = top + ROW_H * 2;
    }

    function drawLegendAndSignature() {
      ensureSpace(140);
      doc.moveDown(1);
      const colTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(BASE_FONT).text("Jenis Absen :", left, colTop);
      doc.font("Helvetica").fontSize(BASE_FONT);
      const absenLegend = [
        ["SP", "Surat Pernyataan Tanggung Jawab Mutlak"],
        ["S", "Sakit"],
        ["C", "Cuti"],
        ["I", "Ijin"],
        ["DL", "Dinas Luar"],
        ["TK", "Tidak Ada Keterangan"],
        ["H", "Hari Masuk"],
        ["HK", "Total Hari Kerja"],
      ];
      let ly = colTop + 12;
      for (const [code, desc] of absenLegend) {
        doc.text(`${code}  : ${desc}`, left, ly);
        ly += 10;
      }

      const col2X = left + 220;
      doc.font("Helvetica-Bold").fontSize(BASE_FONT).text("Jenis Cuti", col2X, colTop);
      doc.font("Helvetica").fontSize(BASE_FONT);
      let ly2 = colTop + 12;
      for (const lt of cutiTypes) {
        doc.text(`${lt.id}  : ${lt.name}`, col2X, ly2, { width: 260 });
        ly2 += 10;
      }

      const col3X = left + 500;
      doc.font("Helvetica-Bold").fontSize(BASE_FONT).text(`Libur dalam bulan ${INDO_MONTHS[m - 1]} :`, col3X, colTop, { width: 260 });
      doc.font("Helvetica").fontSize(BASE_FONT);
      let ly3 = colTop + 12;
      for (const h of holidays) {
        const day = Number(h.date.slice(8, 10));
        doc.text(`${day}  : ${h.description}`, col3X, ly3, { width: 260 });
        ly3 += 10;
      }

      const signY = Math.max(ly, ly2, ly3, colTop) + 20;
      const signX = right - 220;
      doc.font("Helvetica").fontSize(BASE_FONT);
      doc.text(`Palopo, ${lastDateLabel(month)}`, signX, signY);
      doc.text("Mengetahui,", signX, doc.y + 4);
      doc.text("Kepala Biro AKU", signX, doc.y);
      doc.moveDown(3.5);
      doc.font("Helvetica-Bold").text("Dr. H.M. Arsyad Ambo Tuo, M.Ag.", signX, doc.y);
      doc.font("Helvetica").text("NIP. 196705152000031011", signX, doc.y);
    }

    unitGroups.forEach((group, groupIndex) => {
      if (groupIndex > 0) doc.addPage();
      doc.y = doc.page.margins.top;
      drawKop();
      drawColumnHeader();

      group.employees.forEach((emp, i) => {
        const days = daysByEmployee.get(emp.id) ?? [];
        const summary = summarizeMonth(days);
        ensureSpace(ROW_H * 2);
        drawEmployeeRows(i + 1, emp, days, summary);
      });

      drawLegendAndSignature();
    });

    doc.end();
  });
}

// --- Excel ---------------------------------------------------------------

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Unit";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const suffixText = ` (${suffix})`;
    candidate = base.slice(0, 31 - suffixText.length) + suffixText;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function buildAttendanceGridExcel(
  unitGroups: UnitGroup[],
  daysByEmployee: Map<string, ExportDay[]>,
  month: string,
  holidays: HolidayInfo[],
  cutiTypes: LeaveTypeInfo[],
): Promise<Buffer> {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  const SPECIAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3B0" } };
  const LATE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6F5F5" } };
  const BLANK_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  const thin: ExcelJS.Border = { style: "thin", color: { argb: "FF999999" } };
  const borderAll = { top: thin, left: thin, bottom: thin, right: thin };

  for (const group of unitGroups) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(group.unitName, usedNames));

    sheet.addRow([`DAFTAR HADIR ${group.unitName.toUpperCase()}`]).font = { bold: true, size: 13 };
    sheet.addRow([`Bulan : ${monthLabel(month)}`]);
    sheet.addRow([]);

    const header1 = ["No", "Nama / NIP", "Gol", "Jam", ...Array(daysInMonth).fill(""), ...Array(SUMMARY_LABELS.length).fill("")];
    const header2 = ["", "", "", "", ...Array.from({ length: daysInMonth }, (_, i) => i + 1), ...SUMMARY_LABELS];
    const h1 = sheet.addRow(header1);
    h1.font = { bold: true };
    const h2 = sheet.addRow(header2);
    h2.font = { bold: true };

    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 24;
    sheet.getColumn(3).width = 8;
    sheet.getColumn(4).width = 9;
    for (let d = 0; d < daysInMonth; d++) sheet.getColumn(5 + d).width = 6;
    for (let s = 0; s < SUMMARY_LABELS.length; s++) sheet.getColumn(5 + daysInMonth + s).width = 5;

    group.employees.forEach((emp, index) => {
      const days = daysByEmployee.get(emp.id) ?? [];
      const summary = summarizeMonth(days);
      const values = [summary.sp, summary.s, summary.c, summary.i, summary.dl, summary.tk, summary.h, summary.hk];

      const datangRow = sheet.addRow([
        index + 1,
        `${emp.name}\n${emp.nip ?? "-"}`,
        emp.rankCode ?? "-",
        "DATANG",
        ...days.map((d) => cellText(d, "datang")),
        ...values,
      ]);
      const pulangRow = sheet.addRow([
        "",
        "",
        "",
        "PULANG",
        ...days.map((d) => cellText(d, "pulang")),
        ...Array(SUMMARY_LABELS.length).fill(""),
      ]);

      datangRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
      sheet.mergeCells(datangRow.number, 1, pulangRow.number, 1);
      sheet.mergeCells(datangRow.number, 2, pulangRow.number, 2);
      sheet.mergeCells(datangRow.number, 3, pulangRow.number, 3);
      for (let i = 0; i < SUMMARY_LABELS.length; i++) {
        sheet.mergeCells(datangRow.number, 5 + daysInMonth + i, pulangRow.number, 5 + daysInMonth + i);
      }

      days.forEach((day, i) => {
        const kind = cellKind(day);
        const fill = kind === "special" ? SPECIAL_FILL : kind === "late" ? LATE_FILL : kind === "blank" ? BLANK_FILL : undefined;
        const col = 5 + i;
        if (fill) {
          datangRow.getCell(col).fill = fill;
          pulangRow.getCell(col).fill = fill;
        }
        datangRow.getCell(col).border = borderAll;
        pulangRow.getCell(col).border = borderAll;
      });
      for (let c = 1; c <= 4 + daysInMonth + SUMMARY_LABELS.length; c++) {
        datangRow.getCell(c).border = borderAll;
        pulangRow.getCell(c).border = borderAll;
      }
    });

    sheet.addRow([]);
    sheet.addRow(["Jenis Absen :", null, "Jenis Cuti", null, `Libur dalam bulan ${INDO_MONTHS[m - 1]} :`]).font = { bold: true };
    const absenLegend: [string, string][] = [
      ["SP", "Surat Pernyataan Tanggung Jawab Mutlak"],
      ["S", "Sakit"],
      ["C", "Cuti"],
      ["I", "Ijin"],
      ["DL", "Dinas Luar"],
      ["TK", "Tidak Ada Keterangan"],
      ["H", "Hari Masuk"],
      ["HK", "Total Hari Kerja"],
    ];
    const rows = Math.max(absenLegend.length, cutiTypes.length, holidays.length);
    for (let i = 0; i < rows; i++) {
      const absen = absenLegend[i];
      const cuti = cutiTypes[i];
      const holiday = holidays[i];
      sheet.addRow([
        absen ? `${absen[0]}  : ${absen[1]}` : "",
        null,
        cuti ? `${cuti.id}  : ${cuti.name}` : "",
        null,
        holiday ? `${Number(holiday.date.slice(8, 10))}  : ${holiday.description}` : "",
      ]);
    }

    sheet.addRow([]);
    sheet.addRow([`Palopo, ${lastDateLabel(month)}`]);
    sheet.addRow(["Mengetahui,"]);
    sheet.addRow(["Kepala Biro AKU"]);
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow(["Dr. H.M. Arsyad Ambo Tuo, M.Ag."]).font = { bold: true };
    sheet.addRow(["NIP. 196705152000031011"]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
