// Pinjaman nasabah lama: pinjaman yang sudah berjalan di pembukuan sebelum
// aplikasi ini dipakai. Tercatat sebagai transaksi resmi berjenis 'lama' dengan
// dua angka — `principal` menyimpan jumlah pinjaman lamanya dan `totalDue`
// menyimpan saldo yang masih ditagih — sehingga sisa tagihannya hidup di tabel
// pinjaman dan bisa diangsur lewat menu Angsuran seperti pinjaman biasa.
//
// Saldonya diperlakukan sama seperti tagihan pinjaman baru: angsurannya masuk
// Storting, ikut rumus Tunai, dan ikut laba rugi di Perkembangan, sebab uangnya
// benar-benar diterima kolektor pada hari itu. Yang berbeda hanya jumlah pinjaman
// lamanya. Uang itu keluar sebelum aplikasi ini ada, jadi tidak pernah muncul
// sebagai drop kas maupun modal yang disalurkan periode ini; nominalnya hanya
// menjadi keterangan dan dasar pemecahan jasa atas saldonya.

/** Penanda transaksi saldo lama di tabel pinjaman. */
export const LEGACY_KIND = 'lama'

export type KindedLoan = { kind?: string | null }

/** Transaksi saldo lama, bukan drop pinjaman baru. */
export const isLegacyLoan = (loan: KindedLoan) => loan.kind === LEGACY_KIND

/** Drop kas hanya berasal dari pinjaman yang uangnya benar-benar keluar. */
export const isDropLoan = (loan: KindedLoan) => !isLegacyLoan(loan)

/**
 * Kumpulan id transaksi saldo lama. Setoran dipisahkan lewat kumpulan ini, sebab
 * baris angsuran hanya menyimpan `loanId` — jenis pinjamannya ada di tagihannya.
 */
export const legacyLoanIds = (loans: (KindedLoan & { id: number })[]) =>
  new Set(loans.filter(isLegacyLoan).map(l => l.id))

export type LegacyLoan = { customerId: number; principal: number; totalDue: number; paid: number; balance: number; status: string }
export type LegacyMember = { id: number; legacyOpening: number; legacyBalance: number }

/** Nasabah lama dikenali dari transaksi saldo lamanya, bukan tanggal gabung. */
export const isLegacyMember = (c: LegacyMember, legacyLoans: LegacyLoan[]) =>
  legacyLoans.some(l => l.customerId === c.id) || c.legacyOpening > 0 || c.legacyBalance > 0

/** Cari transaksi saldo lama milik satu nasabah. */
export const legacyLoanOf = (c: { id: number }, legacyLoans: LegacyLoan[]) =>
  legacyLoans.find(l => l.customerId === c.id)

export type LegacySummary = { members: number; principal: number; booked: number; balance: number; settled: number; cleared: number }

/**
 * Rekap pinjaman lama untuk kartu ringkasan menu Data Nasabah. `principal`
 * adalah jumlah pinjaman lamanya, `booked` saldo yang dibukukan sebagai tagihan,
 * `balance` sisa yang masih ditagih, dan `settled` angsuran yang sudah diterima.
 */
export function legacySummary(customers: LegacyMember[], legacyLoans: LegacyLoan[]): LegacySummary {
  const rows = customers.filter(c => isLegacyMember(c, legacyLoans))
  const mine = legacyLoans.filter(l => rows.some(c => c.id === l.customerId))
  const principal = mine.reduce((n, l) => n + l.principal, 0)
  const booked = mine.reduce((n, l) => n + l.totalDue, 0)
  const balance = mine.reduce((n, l) => n + l.balance, 0)
  const settled = mine.reduce((n, l) => n + l.paid, 0)
  return { members: rows.length, principal, booked, balance, settled, cleared: rows.length - mine.filter(l => l.balance > 0).length }
}

/** Porsi saldo lama yang sudah diangsur, dipakai untuk bilah kemajuan per nasabah. */
export const legacyProgress = (loan?: { totalDue: number; paid: number }) =>
  loan && loan.totalDue > 0 ? Math.min(100, Math.round((loan.paid / loan.totalDue) * 100)) : 0
