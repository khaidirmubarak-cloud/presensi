import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { DailyStatusResult } from "./attendance-status";
import type { DeductionTier } from "./tukin";

// Replika layout "PERHITUNGAN TUNJANGAN KINERJA PEGAWAI PER BULAN" legacy cobakinerja
// (cetak/laprekaptukinpegawai.php) -- 1 baris = 1 pegawai (beda dari grid harian
// lib/presensi-export.ts). Kop surat & tanda tangan meniru pola yang sama dengan fitur
// cetak Presensi (kop.php/tabel global hardcode, sudah dikonfirmasi kosong di sesi
// sebelumnya). NPWP/Status Wajib Pajak/SK Penetapan/Nomor Rekening (selalu kosong di
// source PHP-nya juga -- `'' as npwp`, dst) dihilangkan dari cetakan atas permintaan user.

export type BucketStat = { count: number; percent: number };

export type TukinReportRow = {
  no: number;
  name: string;
  rankLabel: string | null;
  nip: string | null;
  employeeCategory: string | null;
  positionName: string | null;
  jobClassId: number | null;
  jobClassAmount: number;
  initialDeduction: number;
  baseAmount: number;
  tk: BucketStat;
  i: BucketStat;
  c5: BucketStat;
  tl: [BucketStat, BucketStat, BucketStat, BucketStat];
  psw: [BucketStat, BucketStat, BucketStat, BucketStat];
  deductionPercent: number;
  deductionAmount: number;
  netAmount: number;
};

export type TukinReportRates = {
  alpaPercent: number;
  iPercent: number;
  c5Percent: number;
  tierPercents: [number, number, number, number];
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

// --- Definisi kolom (lebar tetap, beda dari grid Presensi yang kolom tanggalnya
// dinamis) -- urutan & isi mengikuti laprekaptukinpegawai.php, minus NPWP/Status Wajib
// Pajak/SK Penetapan/Nomor Rekening (dihilangkan atas permintaan user -- selalu kosong
// di source-nya juga). ---------------------------------------------------------------

const COL_LABELS_FIXED: [number, string][] = [
  [0, "No"],
  [1, "Nama"],
  [2, "Pangkat/\nGolongan"],
  [3, "NIP"],
  [4, "Status\nPegawai"],
  [5, "Nama\nJabatan"],
  [6, "Kelas\nJabatan"],
  [7, "Nilai\nTunjangan\nKinerja"],
  [8, "Nilai\nTunjangan\nProfesi"],
  [9, "Tunjangan\nKinerja"],
  [32, "Total\nPotongan\n%"],
  [33, "Total\nPengurangan\nRupiah"],
  [34, "Tunjangan\nKinerja\nDiterima"],
];

const GROUPED = [
  { start: 10, group: "Tidak Masuk\nKerja" },
  { start: 12, group: "Tidak Berada di\nTempat Tugas" },
  { start: 14, group: "Cuti Alasan\nPenting > 2 Hari" },
  { start: 16, group: "TL1" },
  { start: 18, group: "TL2" },
  { start: 20, group: "TL3" },
  { start: 22, group: "TL4" },
  { start: 24, group: "PSW1" },
  { start: 26, group: "PSW2" },
  { start: 28, group: "PSW3" },
  { start: 30, group: "PSW4" },
] as const;

const COL_WIDTHS: number[] = [
  22, 95, 68, 68, 40, 78, 34, 54, 54, 54, // 0-9
  22, 26, 22, 26, 22, 26, // 10-15 TK,I,C5
  22, 26, 22, 26, 22, 26, 22, 26, // 16-23 TL1-4
  22, 26, 22, 26, 22, 26, 22, 26, // 24-31 PSW1-4
  40, 54, 58, // 32-34
];

const TOTAL_COLS = COL_WIDTHS.length;

const BASE_FONT = 7;
const HEADER1_H = 34;
const HEADER2_H = 18;
const HEADER3_H = 12;
const HEADER_H = HEADER1_H + HEADER2_H + HEADER3_H;
const ROW_H = 20;
const MARGIN = 24;

function rowValues(r: TukinReportRow, rates: TukinReportRates): (string)[] {
  const v: string[] = new Array(TOTAL_COLS).fill("");
  v[0] = String(r.no);
  v[1] = r.name;
  v[2] = r.rankLabel ?? "-";
  v[3] = r.nip ?? "-";
  v[4] = r.employeeCategory ?? "-";
  v[5] = r.positionName ?? "-";
  v[6] = r.jobClassId !== null ? String(r.jobClassId) : "-";
  v[7] = rupiah(r.jobClassAmount);
  v[8] = rupiah(r.initialDeduction);
  v[9] = rupiah(r.baseAmount);
  v[10] = String(r.tk.count);
  v[11] = pct(r.tk.percent);
  v[12] = String(r.i.count);
  v[13] = pct(r.i.percent);
  v[14] = String(r.c5.count);
  v[15] = pct(r.c5.percent);
  for (let t = 0; t < 4; t++) {
    v[16 + t * 2] = String(r.tl[t].count);
    v[17 + t * 2] = pct(r.tl[t].percent);
    v[24 + t * 2] = String(r.psw[t].count);
    v[25 + t * 2] = pct(r.psw[t].percent);
  }
  v[32] = pct(r.deductionPercent);
  v[33] = rupiah(r.deductionAmount);
  v[34] = rupiah(r.netAmount);
  return v;
}

// Tabulasi 11 kategori (TK/I/C5/TL1-4/PSW1-4) dari status harian -- persis pola
// computeDailyDeduction (lib/tukin.ts) tapi menghasilkan count per kategori/tier, bukan
// cuma agregat persen (yang sudah tersimpan di tukin_calculations dan dipakai apa adanya
// utk kolom Total Pengurangan). C6/CS dihitung sistem tapi tidak dicetak -- sama seperti
// source PHP-nya (echo baris 464-503 cuma print TK/I/C5).
function tierIndex(minutes: number | null, tiers: DeductionTier[]): number {
  if (!minutes || minutes <= 0) return -1;
  const sorted = [...tiers].sort((a, b) => (a.max_minutes ?? Infinity) - (b.max_minutes ?? Infinity));
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].max_minutes === null || minutes <= sorted[i].max_minutes!) return i;
  }
  return -1;
}

export function summarizeTukinBreakdown(
  days: DailyStatusResult[],
  tiers: DeductionTier[],
  alpaPercent: number,
  iPercent: number,
  c5Percent: number,
): Pick<TukinReportRow, "tk" | "i" | "c5" | "tl" | "psw"> {
  const sortedTiers = [...tiers].sort((a, b) => (a.max_minutes ?? Infinity) - (b.max_minutes ?? Infinity));
  let tkCount = 0;
  let iCount = 0;
  let c5Count = 0;
  const tlCount = [0, 0, 0, 0];
  const pswCount = [0, 0, 0, 0];

  for (const day of days) {
    if (day.status === "belum_ada_data") tkCount++;
    if (day.status === "cuti" && day.leaveTypeId === "I") iCount++;
    if (day.status === "cuti" && day.leaveTypeId === "C5") c5Count++;
    const tIdx = tierIndex(day.telatMenit, tiers);
    if (tIdx >= 0) tlCount[tIdx]++;
    const pIdx = tierIndex(day.pulangCepatMenit, tiers);
    if (pIdx >= 0) pswCount[pIdx]++;
  }

  const mk = (count: number, rate: number): BucketStat => ({ count, percent: count * rate });
  return {
    tk: mk(tkCount, alpaPercent),
    i: mk(iCount, iPercent),
    c5: mk(c5Count, c5Percent),
    tl: [
      mk(tlCount[0], sortedTiers[0]?.percent ?? 0),
      mk(tlCount[1], sortedTiers[1]?.percent ?? 0),
      mk(tlCount[2], sortedTiers[2]?.percent ?? 0),
      mk(tlCount[3], sortedTiers[3]?.percent ?? 0),
    ],
    psw: [
      mk(pswCount[0], sortedTiers[0]?.percent ?? 0),
      mk(pswCount[1], sortedTiers[1]?.percent ?? 0),
      mk(pswCount[2], sortedTiers[2]?.percent ?? 0),
      mk(pswCount[3], sortedTiers[3]?.percent ?? 0),
    ],
  };
}

// --- PDF -------------------------------------------------------------------------

export async function buildTukinReportPdf(
  rows: TukinReportRow[],
  period: string,
  rates: TukinReportRates,
): Promise<Buffer> {
  const { bulan, tahun } = periodLabel(period);
  const tableWidth = COL_WIDTHS.reduce((a, b) => a + b, 0);
  const pageWidth = tableWidth + MARGIN * 2;
  const pageHeight = 850;

  const logoPath = path.join(process.cwd(), "assets", "logo-uin-palopo.jpg");
  const logoBuffer = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;

    function colX(index: number): number {
      let x = left;
      for (let i = 0; i < index; i++) x += COL_WIDTHS[i];
      return x;
    }

    function drawKop() {
      const top = doc.y;
      if (logoBuffer) doc.image(logoBuffer, left, top, { width: 56 });
      // Teks kop di-center pada lebar PENUH (left..right), sama seperti judul "PERHITUNGAN
      // TUNJANGAN KINERJA..." di bawahnya -- supaya keduanya sejajar/segaris tengah. Logo
      // digambar terpisah di pojok kiri atas, tidak ikut menggeser box center teks (lebar
      // halaman jauh lebih besar dari lebar teks kop, jadi aman tidak akan bertabrakan).
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
      doc.font("Helvetica-Bold").fontSize(BASE_FONT + 3).text("PERHITUNGAN TUNJANGAN KINERJA PEGAWAI PER BULAN", left, doc.y, {
        width: right - left,
        align: "center",
      });
      doc.moveDown(0.6);
      doc.font("Helvetica").fontSize(BASE_FONT + 1);
      doc.text("SATKER/UNIT KERJA : UIN PALOPO", left, doc.y);
      doc.text(`BULAN : ${bulan} TAHUN ${tahun}`, left, doc.y);
      doc.moveDown(0.8);
    }

    function drawColumnHeader() {
      const top = doc.y;
      doc.lineWidth(0.5).strokeColor("#000000");

      // Kolom tetap (rowspan penuh 3 baris header).
      doc.font("Helvetica-Bold").fontSize(BASE_FONT);
      for (const [index, label] of COL_LABELS_FIXED) {
        const x = colX(index);
        const w = COL_WIDTHS[index];
        doc.rect(x, top, w, HEADER_H).stroke();
        doc.text(label, x + 1, top + 4, { width: w - 2, align: "center" });
      }

      // Kolom berkelompok (TK/I/C5/TL1-4/PSW1-4) -- baris1: label grup (colspan2), baris2:
      // "Jml Hr" / rate%, baris3: nomor kolom (digambar bareng semua kolom di bawah).
      const rateFor = (start: number): number => {
        if (start === 10) return rates.alpaPercent;
        if (start === 12) return rates.iPercent;
        if (start === 14) return rates.c5Percent;
        const tierIdx = start <= 22 ? (start - 16) / 2 : (start - 24) / 2;
        return rates.tierPercents[tierIdx];
      };
      for (const g of GROUPED) {
        const x = colX(g.start);
        const w = COL_WIDTHS[g.start] + COL_WIDTHS[g.start + 1];
        doc.rect(x, top, w, HEADER1_H).stroke();
        doc.text(g.group, x + 1, top + 4, { width: w - 2, align: "center" });

        const x1 = colX(g.start);
        const w1 = COL_WIDTHS[g.start];
        doc.rect(x1, top + HEADER1_H, w1, HEADER2_H).stroke();
        doc.text("Jml\nHr", x1 + 1, top + HEADER1_H + 2, { width: w1 - 2, align: "center" });

        const x2 = colX(g.start + 1);
        const w2 = COL_WIDTHS[g.start + 1];
        doc.rect(x2, top + HEADER1_H, w2, HEADER2_H).stroke();
        doc.text(pct(rateFor(g.start)), x2 + 1, top + HEADER1_H + 5, { width: w2 - 2, align: "center", lineBreak: false });
      }

      // Baris nomor kolom, di bawah semua kolom.
      doc.font("Helvetica").fontSize(BASE_FONT - 1);
      for (let i = 0; i < COL_WIDTHS.length; i++) {
        const x = colX(i);
        const w = COL_WIDTHS[i];
        const y = top + HEADER1_H + HEADER2_H;
        doc.rect(x, y, w, HEADER3_H).stroke();
        doc.text(String(i + 1), x, y + 1, { width: w, align: "center", lineBreak: false });
      }

      doc.y = top + HEADER_H;
      doc.font("Helvetica").fontSize(BASE_FONT);
    }

    function ensureSpace(height: number) {
      if (doc.y + height > bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawColumnHeader();
      }
    }

    function drawRow(values: string[], bold = false) {
      const top = doc.y;
      doc.lineWidth(0.4).strokeColor("#999999").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(BASE_FONT);
      for (let i = 0; i < COL_WIDTHS.length; i++) {
        const x = colX(i);
        const w = COL_WIDTHS[i];
        doc.rect(x, top, w, ROW_H).stroke();
        const align = i === 1 || i === 5 ? "left" : "center";
        doc.text(values[i], x + 2, top + ROW_H / 2 - 3, { width: w - 4, align, ellipsis: true, lineBreak: false });
      }
      doc.y = top + ROW_H;
    }

    function drawSignature() {
      ensureSpace(90);
      doc.moveDown(1.5);
      const signX = right - 220;
      doc.font("Helvetica").fontSize(BASE_FONT + 1);
      doc.text(`Palopo, ${lastDateLabel(period)}`, signX, doc.y);
      doc.text("Mengetahui,", signX, doc.y + 4);
      doc.text("Kepala Biro AKU", signX, doc.y);
      doc.moveDown(3.5);
      doc.font("Helvetica-Bold").text("Dr. H.M. Arsyad Ambo Tuo, M.Ag.", signX, doc.y);
      doc.font("Helvetica").text("NIP. 196705152000031011", signX, doc.y);
    }

    doc.y = doc.page.margins.top;
    drawKop();
    drawColumnHeader();

    let totalNet = 0;
    for (const r of rows) {
      ensureSpace(ROW_H);
      drawRow(rowValues(r, rates));
      totalNet += r.netAmount;
    }

    ensureSpace(ROW_H);
    const totalValues = new Array(TOTAL_COLS).fill("");
    totalValues[1] = "TOTAL";
    totalValues[34] = rupiah(totalNet);
    drawRow(totalValues, true);

    drawSignature();
    doc.end();
  });
}

// --- Excel -------------------------------------------------------------------------

export async function buildTukinReportExcel(
  rows: TukinReportRow[],
  period: string,
  rates: TukinReportRates,
): Promise<Buffer> {
  const { bulan, tahun } = periodLabel(period);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tunjangan Kinerja");

  sheet.addRow(["KEMENTERIAN AGAMA REPUBLIK INDONESIA"]).font = { bold: true, size: 13 };
  sheet.addRow(["UNIVERSITAS ISLAM NEGERI PALOPO"]).font = { bold: true, size: 12 };
  sheet.addRow([]);
  sheet.addRow(["PERHITUNGAN TUNJANGAN KINERJA PEGAWAI PER BULAN"]).font = { bold: true, size: 12 };
  sheet.addRow([`SATKER/UNIT KERJA : UIN PALOPO`]);
  sheet.addRow([`BULAN : ${bulan} TAHUN ${tahun}`]);
  sheet.addRow([]);

  const groupLabelRow: (string | null)[] = new Array(TOTAL_COLS).fill(null);
  const leafLabelRow: (string | null)[] = new Array(TOTAL_COLS).fill(null);
  for (const [index, label] of COL_LABELS_FIXED) {
    groupLabelRow[index] = label;
  }
  const rateFor = (start: number): number => {
    if (start === 10) return rates.alpaPercent;
    if (start === 12) return rates.iPercent;
    if (start === 14) return rates.c5Percent;
    const tierIdx = start <= 22 ? (start - 16) / 2 : (start - 24) / 2;
    return rates.tierPercents[tierIdx];
  };
  for (const g of GROUPED) {
    groupLabelRow[g.start] = g.group.replace(/\n/g, " ");
    leafLabelRow[g.start] = "Jml Hr";
    leafLabelRow[g.start + 1] = pct(rateFor(g.start));
  }

  const headerRow1 = sheet.addRow(groupLabelRow.map((v) => v ?? ""));
  headerRow1.font = { bold: true };
  const headerRow2 = sheet.addRow(leafLabelRow.map((v) => v ?? ""));
  headerRow2.font = { bold: true };
  const headerRow3 = sheet.addRow(Array.from({ length: TOTAL_COLS }, (_, i) => i + 1));
  headerRow3.font = { bold: true };

  for (const [index] of COL_LABELS_FIXED) {
    sheet.mergeCells(headerRow1.number, index + 1, headerRow2.number, index + 1);
  }
  for (const g of GROUPED) {
    sheet.mergeCells(headerRow1.number, g.start + 1, headerRow1.number, g.start + 2);
  }

  COL_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = Math.max(6, Math.round(w / 6));
  });

  let totalNet = 0;
  for (const r of rows) {
    const values = rowValues(r, rates);
    sheet.addRow(values);
    totalNet += r.netAmount;
  }

  const totalRowValues = new Array(TOTAL_COLS).fill("");
  totalRowValues[1] = "TOTAL";
  totalRowValues[34] = rupiah(totalNet);
  sheet.addRow(totalRowValues).font = { bold: true };

  sheet.addRow([]);
  sheet.addRow([`Palopo, ${lastDateLabel(period)}`]);
  sheet.addRow(["Mengetahui,"]);
  sheet.addRow(["Kepala Biro AKU"]);
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow(["Dr. H.M. Arsyad Ambo Tuo, M.Ag."]).font = { bold: true };
  sheet.addRow(["NIP. 196705152000031011"]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
