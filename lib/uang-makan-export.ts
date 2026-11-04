import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

// Replika layout "REKAP PENERIMAAN UANG MAKAN" legacy cobakinerja (cetak/lapum.php):
// No, Nama, NIP, Gol, Unit Kerja, Hadir, Nominal, PPh, Terima + baris TOTAL, diurutkan
// golongan tertinggi dulu. Kop surat & tanda tangan sama dengan cetak Tunjangan Kinerja
// (lib/tukin-export.ts). Angka dibaca apa adanya dari meal_allowance_calculations (hasil
// tombol "Hitung Uang Makan") supaya identik dengan tabel /admin/uang-makan.

export type MealReportRow = {
  no: number;
  name: string;
  nip: string | null;
  rankCode: string | null;
  unitName: string | null;
  eligibleDays: number;
  grossAmount: number;
  taxPercent: number;
  netAmount: number;
};

const INDO_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function periodLabel(period: string): { bulan: string; tahun: string } {
  const [y, m] = period.split("-").map(Number);
  return { bulan: INDO_MONTHS[m - 1].toUpperCase(), tahun: String(y) };
}

function lastDateLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${daysInMonth} ${INDO_MONTHS[m - 1]} ${y}`;
}

function rupiah(n: number): string {
  return Math.round(n).toLocaleString("id-ID");
}

function pct(n: number): string {
  return `${Number(n.toFixed(2)).toString().replace(".", ",")}%`;
}

const COLUMNS: { label: string; width: number; align: "left" | "center" | "right" }[] = [
  { label: "No", width: 28, align: "center" },
  { label: "Nama", width: 175, align: "left" },
  { label: "NIP", width: 115, align: "center" },
  { label: "Gol", width: 45, align: "center" },
  { label: "Unit Kerja", width: 170, align: "left" },
  { label: "Hadir", width: 45, align: "center" },
  { label: "Nominal (Rp)", width: 80, align: "right" },
  { label: "PPh", width: 45, align: "center" },
  { label: "Terima (Rp)", width: 85, align: "right" },
];

function rowValues(r: MealReportRow): string[] {
  return [
    String(r.no),
    r.name,
    r.nip ?? "-",
    r.rankCode ?? "-",
    r.unitName ?? "-",
    String(r.eligibleDays),
    rupiah(r.grossAmount),
    pct(r.taxPercent),
    rupiah(r.netAmount),
  ];
}

const SIGNATURE = {
  title: "Kepala Biro AKU",
  name: "Dr. H.M. Arsyad Ambo Tuo, M.Ag.",
  nip: "NIP. 196705152000031011",
};

// --- PDF -------------------------------------------------------------------------

const FONT = 8;
const HEADER_H = 20;
const ROW_H = 16;
const MARGIN = 24;

export async function buildMealReportPdf(rows: MealReportRow[], period: string): Promise<Buffer> {
  const { bulan, tahun } = periodLabel(period);
  const logoPath = path.join(process.cwd(), "assets", "logo-uin-palopo.jpg");
  const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const tableWidth = COLUMNS.reduce((a, c) => a + c.width, 0);
    const tableLeft = left + Math.max(0, (right - left - tableWidth) / 2);

    function colX(index: number): number {
      let x = tableLeft;
      for (let i = 0; i < index; i++) x += COLUMNS[i].width;
      return x;
    }

    function drawKop() {
      const top = doc.y;
      if (logoBuffer) doc.image(logoBuffer, left, top, { width: 56 });
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text("KEMENTERIAN AGAMA REPUBLIK INDONESIA", left, top, { width: right - left, align: "center" });
      doc.text("UNIVERSITAS ISLAM NEGERI", left, doc.y, { width: right - left, align: "center" });
      doc.fontSize(13).text("PALOPO", left, doc.y, { width: right - left, align: "center" });
      doc.font("Helvetica").fontSize(7);
      doc.text("Kampus 1 Jalan Agatis Kel. Balandai Kec. Bara Kota Palopo Sulawesi Selatan 91914", left, doc.y, {
        width: right - left,
        align: "center",
      });
      doc.text("email: kontak@uinpalopo.ac.id  website https://uinpalopo.ac.id", left, doc.y, {
        width: right - left,
        align: "center",
      });
      doc.y = Math.max(doc.y, top + 60);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(2).strokeColor("#000000").stroke();
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(FONT + 3);
      doc.text("REKAP PENERIMAAN UANG MAKAN", left, doc.y, { width: right - left, align: "center" });
      doc.text(`BULAN ${bulan} TAHUN ${tahun}`, left, doc.y, { width: right - left, align: "center" });
      doc.moveDown(0.8);
    }

    function drawColumnHeader() {
      const top = doc.y;
      doc.lineWidth(0.5).strokeColor("#000000").font("Helvetica-Bold").fontSize(FONT);
      COLUMNS.forEach((c, i) => {
        const x = colX(i);
        doc.rect(x, top, c.width, HEADER_H).stroke();
        doc.text(c.label, x + 2, top + HEADER_H / 2 - 4, { width: c.width - 4, align: "center", lineBreak: false });
      });
      doc.y = top + HEADER_H;
    }

    function ensureSpace(height: number) {
      if (doc.y + height > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawColumnHeader();
      }
    }

    // Potong teks yang lebih lebar dari kolom dan tambahkan "…". Opsi `ellipsis` pdfkit
    // tidak mencegah teks dibungkus ke baris kedua (menimpa baris di bawahnya), jadi
    // dipotong manual berdasarkan lebar huruf sebenarnya.
    function fit(text: string, width: number): string {
      if (doc.widthOfString(text) <= width) return text;
      let t = text;
      while (t.length > 0 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
      return `${t.trimEnd()}…`;
    }

    function drawRow(values: string[], bold = false) {
      const top = doc.y;
      doc.lineWidth(0.4).strokeColor("#999999").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT);
      COLUMNS.forEach((c, i) => {
        const x = colX(i);
        const w = c.width - 6;
        doc.rect(x, top, c.width, ROW_H).stroke();
        doc.text(fit(values[i], w), x + 3, top + ROW_H / 2 - 3.5, { width: w, align: c.align, lineBreak: false });
      });
      doc.y = top + ROW_H;
    }

    function drawSignature() {
      ensureSpace(100);
      doc.moveDown(1.5);
      const signX = right - 220;
      doc.font("Helvetica").fontSize(FONT + 1);
      doc.text(`Palopo, ${lastDateLabel(period)}`, signX, doc.y);
      doc.text("Mengetahui,", signX, doc.y + 4);
      doc.text(SIGNATURE.title, signX, doc.y);
      doc.moveDown(3.5);
      doc.font("Helvetica-Bold").text(SIGNATURE.name, signX, doc.y);
      doc.font("Helvetica").text(SIGNATURE.nip, signX, doc.y);
    }

    doc.y = doc.page.margins.top;
    drawKop();
    drawColumnHeader();

    let totalDays = 0;
    let totalGross = 0;
    let totalNet = 0;
    for (const r of rows) {
      ensureSpace(ROW_H);
      drawRow(rowValues(r));
      totalDays += r.eligibleDays;
      totalGross += r.grossAmount;
      totalNet += r.netAmount;
    }

    ensureSpace(ROW_H);
    drawRow(["", "TOTAL", "", "", "", String(totalDays), rupiah(totalGross), "", rupiah(totalNet)], true);

    drawSignature();
    doc.end();
  });
}

// --- Excel -------------------------------------------------------------------------

export async function buildMealReportExcel(rows: MealReportRow[], period: string): Promise<Buffer> {
  const { bulan, tahun } = periodLabel(period);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Uang Makan");
  const lastCol = COLUMNS.length;

  const title = (text: string, size: number) => {
    const row = sheet.addRow([text]);
    row.font = { bold: true, size };
    sheet.mergeCells(row.number, 1, row.number, lastCol);
    row.alignment = { horizontal: "center" };
  };
  title("KEMENTERIAN AGAMA REPUBLIK INDONESIA", 13);
  title("UNIVERSITAS ISLAM NEGERI PALOPO", 12);
  sheet.addRow([]);
  title("REKAP PENERIMAAN UANG MAKAN", 12);
  title(`BULAN ${bulan} TAHUN ${tahun}`, 12);
  sheet.addRow([]);

  const thin = { style: "thin" as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const header = sheet.addRow(COLUMNS.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.border = border;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0EA" } };
  });

  // Angka disimpan sebagai angka (bukan teks) supaya bisa dijumlah/diolah di Excel.
  const NUMBER_FMT = "#,##0";
  let totalDays = 0;
  let totalGross = 0;
  let totalNet = 0;
  for (const r of rows) {
    const row = sheet.addRow([
      r.no,
      r.name,
      r.nip ?? "-",
      r.rankCode ?? "-",
      r.unitName ?? "-",
      r.eligibleDays,
      Math.round(r.grossAmount),
      r.taxPercent / 100,
      Math.round(r.netAmount),
    ]);
    row.getCell(7).numFmt = NUMBER_FMT;
    row.getCell(8).numFmt = "0.00%";
    row.getCell(9).numFmt = NUMBER_FMT;
    row.eachCell((cell, col) => {
      cell.border = border;
      cell.alignment = { horizontal: COLUMNS[col - 1].align };
    });
    totalDays += r.eligibleDays;
    totalGross += r.grossAmount;
    totalNet += r.netAmount;
  }

  const total = sheet.addRow(["", "TOTAL", "", "", "", totalDays, Math.round(totalGross), "", Math.round(totalNet)]);
  total.font = { bold: true };
  total.getCell(7).numFmt = NUMBER_FMT;
  total.getCell(9).numFmt = NUMBER_FMT;
  total.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = border;
    cell.alignment = { horizontal: COLUMNS[col - 1].align };
  });

  COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(6, Math.round(c.width / 5.5));
  });
  sheet.getColumn(3).numFmt = "@"; // NIP sebagai teks, jangan jadi notasi ilmiah

  sheet.addRow([]);
  const sign = (text: string, bold = false) => {
    const row = sheet.addRow([]);
    const cell = row.getCell(lastCol - 2);
    cell.value = text;
    if (bold) cell.font = { bold: true };
  };
  sign(`Palopo, ${lastDateLabel(period)}`);
  sign("Mengetahui,");
  sign(SIGNATURE.title);
  sheet.addRow([]);
  sheet.addRow([]);
  sign(SIGNATURE.name, true);
  sign(SIGNATURE.nip);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
