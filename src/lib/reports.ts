// Susunan dokumen PDF untuk layar Angsuran dan Tunai. Angka yang dicetak
// berasal dari hitungan yang sama dengan yang tampil di layar, jadi laporan
// tidak pernah berbeda dengan dasbor.
import { rupiah, shortDate, stampNow } from './format'
import { cashPosition, DROP_CASH_RATE, type CashSummary } from './cash'
import { classificationBadge, classificationTally, RECOVERED_LABEL } from './classification'
import { isDropLoan, isLegacyLoan } from './legacy'
import type { PdfDoc } from './pdf'

const DROP_PCT = Math.round(DROP_CASH_RATE * 100)
const fileStamp = (iso: string) => iso.replace(/-/g, '')

export type AngsuranRow = {
  customerName: string
  memberNumber: string
  kind?: string | null
  dropDate: string
  dueDate: string
  totalDue: number
  paid: number
  balance: number
  status: string
  classification?: string | null
  lastPaymentDate?: string | null
}

/**
 * Laporan angsuran: posisi tagihan setiap nasabah beserta klasifikasi statusnya.
 * `scope` menjelaskan penyaringan yang sedang aktif di layar supaya laporan
 * cetak tidak pernah berbeda dengan daftar yang dilihat pengelola.
 */
export function angsuranPdf(rows: AngsuranRow[], today: string, scope = 'Semua klasifikasi'): PdfDoc {
  const totalDue = rows.reduce((n, r) => n + r.totalDue, 0)
  const paid = rows.reduce((n, r) => n + r.paid, 0)
  const balance = rows.reduce((n, r) => n + r.balance, 0)
  const macet = rows.filter(r => r.status === 'Macet').length
  const lunas = rows.filter(r => r.status === 'Lunas').length
  // Pinjaman nasabah lama ikut dilaporkan: tagihannya nyata, diangsur lewat menu
  // yang sama, dan angsurannya ikut dihitung sebagai storting.
  const legacy = rows.filter(isLegacyLoan)
  const legacyBalance = legacy.reduce((n, r) => n + r.balance, 0)
  const dropDue = rows.filter(isDropLoan).reduce((n, r) => n + r.totalDue, 0)
  // Klasifikasi status nasabah ikut tercetak supaya laporan lapangan memakai
  // penggolongan yang sama dengan layar Angsuran.
  const tally = classificationTally(rows)

  return {
    fileName: `kolekta-angsuran-${fileStamp(today)}.pdf`,
    kind: 'Laporan angsuran',
    title: 'Posisi tagihan & angsuran nasabah',
    subtitle: 'Drop pinjaman baru ditagih 120% dari pokok. Saldo nasabah lama ikut dilaporkan sebagai tagihan resmi dan angsurannya ikut dihitung sebagai storting; hanya jumlah pinjaman lamanya yang berada di luar rekap tunai dan laba rugi. Sisa tagihan dihitung dari total tagihan dikurangi seluruh setoran yang tercatat. Klasifikasi status: PB pinjaman baru, L lancar, CM calon macet, Macet — setoran nasabah tidak memindahkan golongannya.',
    meta: [`Dicetak ${stampNow()} WIB`, scope, `${rows.length} tagihan`, `${legacy.length} pinjaman lama`, `${lunas} lunas`, `${macet} lewat jatuh tempo`],
    stats: [
      { label: 'Total tagihan', value: rupiah(totalDue), note: `${rupiah(dropDue)} dari drop pinjaman` },
      { label: 'Sudah terbayar', value: rupiah(paid), note: 'akumulasi seluruh setoran tercatat' },
      { label: 'Sisa tagihan', value: rupiah(balance), note: `termasuk ${rupiah(legacyBalance)} pinjaman lama` },
      { label: 'PB / L', value: `${tally.counts.PB} / ${tally.counts.L}`, note: 'pinjaman baru & lancar' },
      { label: 'CM / Macet', value: `${tally.counts.CM} / ${tally.counts.Macet}`, note: 'calon macet & macet' },
      { label: RECOVERED_LABEL, value: tally.settled.toLocaleString('id-ID'), note: 'CM/Macet yang sisanya nol, golongannya tetap' },
    ],
    table: {
      columns: [
        { header: 'Nasabah', width: 2.1 },
        { header: 'No. anggota', width: 1.3 },
        { header: 'Jenis', width: 1.05 },
        { header: 'Tanggal', width: 1.05 },
        { header: 'Jatuh tempo', width: 1.05 },
        { header: 'Bayar terakhir', width: 1.05 },
        { header: 'Total tagihan', width: 1.25, align: 'right' },
        { header: 'Terbayar', width: 1.25, align: 'right' },
        { header: 'Sisa', width: 1.25, align: 'right' },
        { header: 'Klasifikasi', width: 1.15 },
        { header: 'Status', width: 0.9 },
      ],
      rows: rows.map(r => [
        r.customerName, r.memberNumber, isLegacyLoan(r) ? 'Pinjaman lama' : 'Drop 120%',
        shortDate(r.dropDate), shortDate(r.dueDate), r.lastPaymentDate ? shortDate(r.lastPaymentDate) : '-',
        rupiah(r.totalDue), rupiah(r.paid), rupiah(r.balance),
        classificationBadge(r).label, r.status,
      ]),
      total: ['Total keseluruhan', '', '', '', '', '', rupiah(totalDue), rupiah(paid), rupiah(balance), '', ''],
      strong: [0, 8],
    },
    note: 'Dibuat otomatis oleh MSB. Seluruh nominal dalam rupiah penuh. Pinjaman nasabah lama tidak pernah dihitung sebagai drop kas, dan angsurannya tidak masuk storting, tunai, maupun perkembangan.',
    landscape: true,
  }
}

/** Laporan tunai: rincian kas satu tanggal beserta riwayat harian terakhir. */
export function tunaiPdf(date: string, summary: CashSummary, history: CashSummary[]): PdfDoc {
  const posisi = cashPosition(summary.tunai)

  return {
    fileName: `kolekta-tunai-${fileStamp(date)}.pdf`,
    kind: 'Laporan tunai',
    title: `Rekap tunai ${shortDate(date)}`,
    subtitle: `Tunai = storting + kasbon − drop ${DROP_PCT}% − pengeluaran − titipan. Hasil plus berarti Tekor, hasil minus berarti Lebih. Storting menghitung seluruh angsuran yang masuk, termasuk angsuran saldo nasabah lama; jumlah pinjaman lamanya sendiri tidak pernah menambah kolom drop.`,
    meta: [`Posisi kas: ${posisi.label} ${rupiah(posisi.nominal)}`, `Dicetak ${stampNow()} WIB`],
    stats: [
      { label: 'Storting', value: rupiah(summary.storting), note: 'seluruh angsuran yang masuk hari ini' },
      { label: 'Angsuran lama', value: rupiah(summary.stortingLama), note: 'bagian storting dari saldo nasabah lama' },
      { label: 'Kasbon', value: rupiah(summary.kasbon), note: 'tambahan dari kantor' },
      { label: `Drop ${DROP_PCT}%`, value: `− ${rupiah(summary.dropCash)}`, note: `${rupiah(summary.dropGross)} pokok drop` },
      { label: 'Pengeluaran', value: `− ${rupiah(summary.pengeluaran)}`, note: 'biaya operasional harian' },
      { label: 'Titipan', value: `− ${rupiah(summary.titipan)}`, note: 'dibawa pulang kolektor' },
      { label: `Posisi kas (${posisi.label})`, value: rupiah(posisi.nominal), note: posisi.caption },
    ],
    table: {
      columns: [
        { header: 'Tanggal', width: 1.3 },
        { header: 'Storting', width: 1.25, align: 'right' },
        { header: 'Angsuran lama', width: 1.2, align: 'right' },
        { header: 'Kasbon', width: 1.1, align: 'right' },
        { header: `Drop ${DROP_PCT}%`, width: 1.25, align: 'right' },
        { header: 'Pengeluaran', width: 1.25, align: 'right' },
        { header: 'Titipan', width: 1.1, align: 'right' },
        { header: 'Selisih', width: 1.25, align: 'right' },
        { header: 'Posisi', width: 0.85 },
      ],
      rows: history.map(row => {
        const p = cashPosition(row.tunai)
        return [shortDate(row.date), rupiah(row.storting), rupiah(row.stortingLama), rupiah(row.kasbon), rupiah(row.dropCash),
          rupiah(row.pengeluaran), rupiah(row.titipan), rupiah(p.nominal), p.label]
      }),
      strong: [0, 7],
    },
    note: 'Dibuat otomatis oleh MSB. Kasbon dan titipan diisi manual, sisanya dihitung dari catatan harian. Kolom angsuran lama adalah rincian: nominalnya sudah termasuk di kolom storting, bukan tambahan di luarnya.',
    landscape: true,
  }
}
