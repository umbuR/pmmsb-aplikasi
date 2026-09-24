// Klasifikasi status nasabah di menu Angsuran: PB → L → CM → Macet.
//
// Klasifikasi menempel pada tagihan (baris `loans`), bukan pada master nasabah.
// Alasannya: aturan pertama menyebut `tanggal dropan` sebagai penentu status
// awal, dan satu nasabah bisa punya drop baru sekaligus saldo lama yang sudah
// menunggak. Status per nasabah tetap bisa dibaca — diambil dari tagihan
// terburuknya lewat `worstClassification`.
//
// Seluruh keputusan status dihitung di modul ini supaya layar Angsuran, laporan
// PDF, penjadwal tutup bulan, dan server function memakai aturan yang sama.
import { periodOf } from './profit'

export const CLASSIFICATIONS = ['PB', 'L', 'CM', 'Macet'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

/** Tagihan baru selalu lahir sebagai Pinjaman Baru. */
export const DEFAULT_CLASSIFICATION: Classification = 'PB'

export const isClassification = (value: unknown): value is Classification =>
  CLASSIFICATIONS.includes(value as Classification)

/** Nilai dari basis data atau klien tidak pernah dipercaya apa adanya. */
export const asClassification = (value: unknown): Classification =>
  isClassification(value) ? value : DEFAULT_CLASSIFICATION

export const CLASSIFICATION_NAME: Record<Classification, string> = {
  PB: 'Pinjaman Baru',
  L: 'Lancar',
  CM: 'Calon Macet',
  Macet: 'Macet',
}

// Warna pembeda badge: PB biru, L hijau, CM kuning/oranye, Macet merah.
export const CLASSIFICATION_TONE: Record<Classification, string> = { PB: 'pb', L: 'l', CM: 'cm', Macet: 'macet' }

/** Urutan keparahan, dipakai untuk mengambil status terburuk seorang nasabah. */
const SEVERITY: Record<Classification, number> = { PB: 0, L: 1, CM: 2, Macet: 3 }

/**
 * Keterangan tambahan untuk tagihan CM atau Macet yang tagihannya sudah habis.
 * Ini hanya penanda pelengkap — klasifikasinya sendiri tetap CM atau Macet,
 * sebab setoran nasabah tidak pernah memindahkan golongan.
 */
export const RECOVERED_LABEL = 'Lunas Macet'

export const CLASSIFICATION_HINT: Record<Classification, string> = {
  PB: 'Dropan bulan berjalan. Otomatis naik ke Lancar pada tutup bulan.',
  L: 'Angsuran sesuai ketentuan periode. Turun ke Calon Macet bila menunggak.',
  CM: 'Menunggak satu periode. Turun ke Macet bila periode berikutnya masih menunggak.',
  Macet: 'Tunggakan lebih dari dua periode. Statusnya tetap sampai pengelola menyesuaikannya.',
}

/* ===== Hitungan bulan ===== */

const monthIndex = (iso: string) => {
  const [year, month] = periodOf(iso).split('-').map(Number)
  return Number.isFinite(year) && Number.isFinite(month) ? year * 12 + (month - 1) : NaN
}

/** Selisih bulan kalender antara dua tanggal ISO. Negatif berarti tanggal ke depan. */
export function monthsApart(from: string, to: string) {
  const a = monthIndex(from)
  const b = monthIndex(to)
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : 0
}

/** Hari terakhir bulan dari satu tanggal ISO, mis. "2026-02" menjadi 28. */
export function lastDayOfMonth(iso: string) {
  const [year, month] = periodOf(iso).split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 31
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Hari tutup buku: tanggal 30 seperti ketentuan lapangan, atau hari terakhir
 * bulan bila bulannya lebih pendek (Februari) supaya transisi tidak pernah
 * terlewat satu bulan.
 */
export function isClosingDay(iso: string) {
  const day = Number(iso.slice(8, 10))
  if (!Number.isFinite(day)) return false
  return day >= 30 || day === lastDayOfMonth(iso)
}

/* ===== Status awal saat data dimasukkan ===== */

/**
 * Status awal ditentukan dari `tanggal dropan`: dropan bulan berjalan menjadi
 * PB, satu bulan sebelumnya L, dua bulan sebelumnya CM, tiga bulan atau lebih
 * Macet. Tagihan yang sudah lunas tidak pernah lahir sebagai tunggakan.
 */
export function initialClassification(dropDate: string, today: string, settled = false): Classification {
  if (settled) return 'L'
  const age = monthsApart(dropDate, today)
  if (age <= 0) return 'PB'
  if (age === 1) return 'L'
  if (age === 2) return 'CM'
  return 'Macet'
}

/**
 * Status awal beserta penanda periode yang dianggap sudah ditutup. Dropan bulan
 * berjalan dibiarkan terbuka supaya tetap naik PB → L pada tutup bulan,
 * sedangkan data lama yang statusnya sudah dihitung dari umur dropan tidak boleh
 * diturunkan lagi pada bulan yang sama — itu akan menghukum dua kali.
 */
export function initialState(dropDate: string, today: string, settled = false) {
  const classification = initialClassification(dropDate, today, settled)
  const backdated = monthsApart(dropDate, today) >= 1
  return { classification, closedPeriod: backdated ? periodOf(today) : null }
}

/* ===== Tunggakan satu periode ===== */

export type ScheduleLoan = { dropDate: string; dueDate: string; totalDue: number }

/** Tenor pinjaman dalam bulan, minimal satu bulan. */
export const tenorMonths = (loan: ScheduleLoan) => Math.max(1, monthsApart(loan.dropDate, loan.dueDate))

/** Kewajiban angsuran satu bulan: total tagihan dibagi rata sepanjang tenor. */
export const monthlyInstallment = (loan: ScheduleLoan) => Math.ceil(loan.totalDue / tenorMonths(loan))

export type Arrears = {
  /** Kewajiban periode ini, tidak pernah melebihi sisa tagihan. */
  required: number
  /** Angsuran yang masuk pada periode ini. */
  paid: number
  /** Kekurangan setoran periode ini. */
  shortfall: number
  /** Sudah lewat jatuh tempo tapi tagihan belum habis. */
  pastDue: boolean
  /** Menunggak menurut ketentuan periode berjalan. */
  delinquent: boolean
}

/**
 * Tunggakan periode berjalan. Dipakai untuk periode yang sedang dinilai — bulan
 * berjalan di layar Angsuran, atau bulan yang sedang ditutup oleh penjadwal —
 * sebab sisa tagihan awal periode dihitung dari sisa sekarang ditambah setoran
 * periode itu.
 */
export function periodArrears(loan: ScheduleLoan & { balance: number }, paidInPeriod: number, onDate: string): Arrears {
  const paid = Math.max(0, Math.round(paidInPeriod))
  const opening = Math.max(0, loan.balance + paid)
  const required = Math.min(monthlyInstallment(loan), opening)
  const shortfall = Math.max(0, required - paid)
  const pastDue = loan.balance > 0 && Boolean(loan.dueDate) && loan.dueDate <= onDate
  return { required, paid, shortfall, pastDue, delinquent: loan.balance > 0 && (shortfall > 0 || pastDue) }
}

/* ===== Transisi ===== */

export type Transition = { from: Classification; to: Classification; changed: boolean; reason: string }

const move = (from: Classification, to: Classification, reason: string): Transition =>
  ({ from, to, changed: from !== to, reason })

/**
 * Transisi berjenjang pada tutup bulan: PB → L tanpa syarat, L → CM bila
 * menunggak, CM → Macet bila masih menunggak.
 *
 * Nasabah yang menyetor TIDAK naik golongan. Sekali sebuah tagihan masuk CM
 * atau Macet, ia tinggal di sana — termasuk setelah tagihannya habis — sampai
 * pengelola menyesuaikannya sendiri. Daftar penagihan lapangan disusun menurut
 * klasifikasi, jadi golongan yang berpindah-pindah setiap ada setoran membuat
 * kolektor kehilangan jejak nasabahnya.
 */
export function nextAtClosing(current: Classification, arrears: Arrears, settled: boolean): Transition {
  if (current === 'PB') return move(current, 'L', 'Pinjaman baru naik ke Lancar pada tutup bulan.')
  if (settled || !arrears.delinquent) return move(current, current, 'Klasifikasi dipertahankan, tidak ada penurunan pada tutup bulan.')
  if (current === 'L') return move(current, 'CM', 'Menunggak pada periode berjalan.')
  if (current === 'CM') return move(current, 'Macet', 'Masih menunggak pada periode berikutnya.')
  return move(current, 'Macet', 'Tunggakan belum diselesaikan.')
}

/* ===== Tampilan ===== */

export type BadgeLoan = { classification?: string | null; balance: number }
export type ClassificationBadge = { code: Classification; label: string; name: string; tone: string; settled: boolean }

/**
 * Bentuk badge yang tampil di tabel. Klasifikasinya selalu golongan yang
 * tersimpan — tidak pernah ditimpa oleh keadaan pembayaran. Tagihan CM atau
 * Macet yang sisanya sudah nol hanya diberi penanda `settled` supaya layar bisa
 * menambahkan keterangan Lunas Macet di samping badge golongannya.
 */
export function classificationBadge(loan: BadgeLoan): ClassificationBadge {
  const code = asClassification(loan.classification)
  return {
    code,
    label: code,
    name: CLASSIFICATION_NAME[code],
    tone: CLASSIFICATION_TONE[code],
    settled: loan.balance <= 0 && (code === 'CM' || code === 'Macet'),
  }
}

/** Status seorang nasabah: paling berat di antara tagihannya yang masih berjalan. */
export function worstClassification(rows: { classification?: string | null; balance: number }[]): Classification | null {
  const active = rows.filter(r => r.balance > 0)
  const pool = active.length ? active : rows
  if (!pool.length) return null
  return pool.reduce<Classification>((worst, row) => {
    const code = asClassification(row.classification)
    return SEVERITY[code] > SEVERITY[worst] ? code : worst
  }, 'PB')
}

/**
 * Jumlah tagihan per klasifikasi, dipakai kartu ringkasan menu Angsuran.
 * `settled` dihitung sebagai irisan, bukan golongan tersendiri: tagihan CM atau
 * Macet yang sudah habis tetap ikut terhitung pada golongannya.
 */
export function classificationTally(rows: BadgeLoan[]) {
  const counts: Record<Classification, number> = { PB: 0, L: 0, CM: 0, Macet: 0 }
  let settled = 0
  for (const row of rows) {
    const badge = classificationBadge(row)
    counts[badge.code] += 1
    if (badge.settled) settled += 1
  }
  return { counts, settled }
}
