// Rumus kas harian: uang yang boleh tinggal di tangan kolektor pada akhir hari.
// Tunai = storting + kasbon - drop(90%) - pengeluaran - titipan
//
// Angsuran saldo nasabah lama ikut dihitung sebagai storting. Uangnya benar-benar
// masuk ke tangan kolektor hari itu, jadi harus dipertanggungjawabkan lewat rumus
// yang sama dengan angsuran pinjaman baru. Yang tetap berada di luar rumus adalah
// jumlah pinjaman lamanya: uang itu keluar sebelum aplikasi ini dipakai sehingga
// tidak pernah menambah drop kas. Bagian storting yang berasal dari pinjaman lama
// tetap dipisah sebagai `stortingLama` supaya asal setorannya terbaca, tapi
// angkanya sudah termasuk di dalam `storting`.
import { isDropLoan, legacyLoanIds } from './legacy'

/** Drop yang dihitung sebagai kas keluar hanya 90% dari pokok yang disalurkan. */
export const DROP_CASH_RATE = 0.9

export type CashRecord = { loanId: number; paymentDate: string; amount: number }
export type CashLoan = { id: number; dropDate: string; principal: number; kind?: string | null }
export type CashExpense = { expenseDate: string; amount: number }
export type CashManual = { kasbon: number; titipan: number } | undefined | null

export type CashSummary = {
  date: string
  storting: number
  /** Bagian storting yang berasal dari angsuran pinjaman lama, sudah termasuk dalam `storting`. */
  stortingLama: number
  kasbon: number
  dropGross: number
  dropCash: number
  pengeluaran: number
  titipan: number
  tunai: number
}

const sum = (list: number[]) => list.reduce((n, v) => n + v, 0)

/** Hitung kas satu hari dari catatan mentah — dipakai layar Tunai dan rekap harian. */
export function buildCashSummary(date: string, payments: CashRecord[], loans: CashLoan[], expenses: CashExpense[], manual: CashManual): CashSummary {
  const lama = legacyLoanIds(loans)
  const masuk = payments.filter(p => p.paymentDate === date)
  const storting = sum(masuk.map(p => p.amount))
  const stortingLama = sum(masuk.filter(p => lama.has(p.loanId)).map(p => p.amount))
  const dropGross = sum(loans.filter(l => isDropLoan(l) && l.dropDate === date).map(l => l.principal))
  const dropCash = Math.round(dropGross * DROP_CASH_RATE)
  const pengeluaran = sum(expenses.filter(e => e.expenseDate === date).map(e => e.amount))
  const kasbon = Math.max(0, Math.round(manual?.kasbon ?? 0))
  const titipan = Math.max(0, Math.round(manual?.titipan ?? 0))
  return { date, storting, stortingLama, kasbon, dropGross, dropCash, pengeluaran, titipan, tunai: storting + kasbon - dropCash - pengeluaran - titipan }
}

/** Tanggal yang punya aktivitas kas, terbaru lebih dulu. */
export function cashDates(payments: CashRecord[], loans: CashLoan[], expenses: CashExpense[], manualDates: string[]) {
  const all = new Set<string>([...payments.map(p => p.paymentDate), ...loans.filter(isDropLoan).map(l => l.dropDate), ...expenses.map(e => e.expenseDate), ...manualDates])
  return [...all].sort((a, b) => b.localeCompare(a))
}

export type CashTone = 'tekor' | 'lebih' | 'pas'
export type CashPosition = { tone: CashTone; label: string; nominal: number; caption: string }

// Istilah lapangan: sisa tunai yang masih dipegang kolektor berarti setoran belum
// lengkap (tekor). Kalau hasilnya minus, uang yang disetorkan melebihi kewajiban (lebih).
const POSITION_CAPTION: Record<CashTone, string> = {
  tekor: 'Masih ada uang yang belum disetorkan kolektor pada tanggal ini.',
  lebih: 'Setoran melampaui kewajiban hari ini, ada kelebihan kas dari kolektor.',
  pas: 'Kas harian seimbang, tidak ada selisih yang perlu ditagih.',
}

/** Terjemahkan hasil hitungan tunai menjadi posisi kas: plus = Tekor, minus = Lebih. */
export function cashPosition(tunai: number): CashPosition {
  const tone: CashTone = tunai > 0 ? 'tekor' : tunai < 0 ? 'lebih' : 'pas'
  const label = tone === 'tekor' ? 'Tekor' : tone === 'lebih' ? 'Lebih' : 'Pas'
  return { tone, label, nominal: Math.abs(tunai), caption: POSITION_CAPTION[tone] }
}
