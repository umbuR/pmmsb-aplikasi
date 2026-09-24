// Laba rugi koperasi lapangan dihitung dengan dasar kas: jasa pinjaman diakui
// sebagai pendapatan saat angsuran benar-benar masuk, bukan saat drop. Setiap
// setoran dipecah proporsional menurut struktur pinjamannya: pinjaman 120%
// berarti 1/6 bagian setiap setoran adalah jasa, sisanya pengembalian pokok.
//
// Angsuran saldo nasabah lama ikut masuk laporan ini karena uangnya benar-benar
// diterima pada periode berjalan. Pemecahannya memakai dua angka pinjaman lama
// itu sendiri: selisih saldo yang ditagih dengan jumlah pinjaman lamanya menjadi
// porsi jasa, dan bila jumlah pinjamannya sama besar atau lebih besar dari
// saldonya seluruh setoran dihitung sebagai pengembalian pokok — jasa yang sudah
// diakui di pembukuan lama tidak diakui dua kali. Jumlah pinjaman lamanya sendiri
// tidak pernah menambah kolom drop, sebab uangnya keluar sebelum aplikasi ini
// dipakai. Bagian storting yang berasal dari pinjaman lama tetap dipisah sebagai
// `stortingLama`, sudah termasuk di dalam `storting`.
import { isDropLoan, isLegacyLoan } from './legacy'

export type ProfitLoan = { id: number; principal: number; totalDue: number; dropDate: string; kind?: string | null }
export type ProfitPayment = { loanId: number; paymentDate: string; amount: number }
export type ProfitExpense = { expenseDate: string; category: string; amount: number }

export type ProfitPeriod = {
  period: string
  pendapatan: number
  beban: number
  laba: number
  storting: number
  /** Bagian storting yang berasal dari angsuran pinjaman lama, sudah termasuk dalam `storting`. */
  stortingLama: number
  pokok: number
  drop: number
}

export type ProfitTotals = Omit<ProfitPeriod, 'period'> & { margin: number; potensiJasa: number }

/**
 * Porsi jasa dari satu pinjaman, mis. 0,1667 untuk struktur 120%. Pinjaman
 * nasabah lama memakai rumus yang sama atas dua angkanya sendiri, dan hasilnya
 * ditahan di nol bila jumlah pinjamannya tidak lebih kecil dari saldonya.
 */
export const jasaRatio = (loan: { principal: number; totalDue: number }) =>
  loan.totalDue > 0 ? Math.max(0, (loan.totalDue - loan.principal) / loan.totalDue) : 0

/** Pecah satu setoran menjadi pendapatan jasa dan pengembalian pokok. */
export function splitPayment(amount: number, loan?: { principal: number; totalDue: number }) {
  const jasa = loan ? Math.round(amount * jasaRatio(loan)) : 0
  return { jasa, pokok: amount - jasa }
}

/** Bulan kalender dari tanggal ISO, mis. "2026-09-19" menjadi "2026-09". */
export const periodOf = (isoDate: string) => String(isoDate ?? '').slice(0, 7)

const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
export const periodLabel = (period: string) =>
  /^\d{4}-\d{2}$/.test(period) ? monthFmt.format(new Date(`${period}-01T00:00:00`)) : 'Semua periode'

const blank = (period: string): ProfitPeriod => ({ period, pendapatan: 0, beban: 0, laba: 0, storting: 0, stortingLama: 0, pokok: 0, drop: 0 })

/**
 * Susun laba rugi per bulan, terbaru lebih dulu. Pendapatan berasal dari porsi
 * jasa setiap angsuran, beban dari pengeluaran operasional bulan yang sama.
 */
export function buildProfitPeriods(loans: ProfitLoan[], payments: ProfitPayment[], expenses: ProfitExpense[]) {
  const byId = new Map(loans.map(l => [l.id, l]))
  const buckets = new Map<string, ProfitPeriod>()
  const at = (period: string) => {
    const existing = buckets.get(period)
    if (existing) return existing
    const fresh = blank(period)
    buckets.set(period, fresh)
    return fresh
  }

  for (const payment of payments) {
    const loan = byId.get(payment.loanId)
    const row = at(periodOf(payment.paymentDate))
    const { jasa, pokok } = splitPayment(payment.amount, loan)
    row.storting += payment.amount
    row.pendapatan += jasa
    row.pokok += pokok
    // Asal setorannya tetap terbaca terpisah, walau sudah ikut dihitung di atas.
    if (loan && isLegacyLoan(loan)) row.stortingLama += payment.amount
  }
  for (const expense of expenses) at(periodOf(expense.expenseDate)).beban += expense.amount
  for (const loan of loans.filter(isDropLoan)) at(periodOf(loan.dropDate)).drop += loan.principal

  return [...buckets.values()]
    .map(row => ({ ...row, laba: row.pendapatan - row.beban }))
    .sort((a, b) => b.period.localeCompare(a.period))
}

/** Jumlahkan beberapa bulan menjadi satu ringkasan, termasuk jasa yang belum terealisasi. */
export function sumProfit(rows: ProfitPeriod[], potensiJasa: number): ProfitTotals {
  const total = rows.reduce((acc, row) => ({
    pendapatan: acc.pendapatan + row.pendapatan,
    beban: acc.beban + row.beban,
    laba: acc.laba + row.laba,
    storting: acc.storting + row.storting,
    stortingLama: acc.stortingLama + row.stortingLama,
    pokok: acc.pokok + row.pokok,
    drop: acc.drop + row.drop,
  }), { pendapatan: 0, beban: 0, laba: 0, storting: 0, stortingLama: 0, pokok: 0, drop: 0 })
  const margin = total.pendapatan > 0 ? Math.round((total.laba / total.pendapatan) * 100) : 0
  return { ...total, margin, potensiJasa }
}

/**
 * Jasa yang masih menempel pada sisa tagihan — belum boleh diakui sebagai laba,
 * tapi berguna untuk melihat potensi pendapatan bulan-bulan berikutnya. Pinjaman
 * nasabah lama ikut dihitung dengan porsi jasanya sendiri, yang bernilai nol
 * selama jumlah pinjamannya tidak lebih kecil dari saldo yang ditagih.
 */
export function potentialJasa(loans: ProfitLoan[], payments: ProfitPayment[]) {
  const paidByLoan = new Map<number, number>()
  for (const p of payments) paidByLoan.set(p.loanId, (paidByLoan.get(p.loanId) ?? 0) + p.amount)
  return loans.reduce((n, loan) => {
    const balance = Math.max(0, loan.totalDue - (paidByLoan.get(loan.id) ?? 0))
    return n + Math.round(balance * jasaRatio(loan))
  }, 0)
}

/** Beban per jenis pengeluaran, dipakai untuk melihat penyebab laba tergerus. */
export function expenseByCategory(expenses: ProfitExpense[]) {
  const buckets = new Map<string, number>()
  for (const e of expenses) buckets.set(e.category, (buckets.get(e.category) ?? 0) + e.amount)
  return [...buckets.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}

export type ProfitTone = 'laba' | 'rugi' | 'seimbang'
/** Terjemahkan angka laba menjadi label yang dibaca pengurus koperasi. */
export function profitTone(laba: number): { tone: ProfitTone; label: string } {
  if (laba > 0) return { tone: 'laba', label: 'Laba' }
  if (laba < 0) return { tone: 'rugi', label: 'Rugi' }
  return { tone: 'seimbang', label: 'Seimbang' }
}

const shortMonthFmt = new Intl.DateTimeFormat('id-ID', { month: 'short' })
/** Label sumbu grafik, mis. "Sep '26". */
export const periodShort = (period: string) =>
  /^\d{4}-\d{2}$/.test(period) ? `${shortMonthFmt.format(new Date(`${period}-01T00:00:00`))} '${period.slice(2, 4)}` : period
