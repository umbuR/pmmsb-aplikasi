// Mesin transisi klasifikasi status nasabah.
//
// Modul ini sengaja tidak memakai `createServerFn` maupun Netlify Identity
// supaya bisa dipakai dua pintu sekaligus:
//   1. penjadwal tutup bulan di netlify/functions/klasifikasi-status.mts, dan
//   2. server function di src/server/kolekta.functions.ts.
//
// Aturannya sendiri hidup di src/lib/classification.ts sehingga layar Angsuran
// dan laporan PDF membaca ketentuan yang sama persis dengan yang dieksekusi di
// sini — tidak ada aturan yang ditulis dua kali.
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { classificationLogs, loans, payments } from '../../db/schema.js'
import {
  asClassification,
  nextAtClosing,
  periodArrears,
  type Classification,
} from '../lib/classification'
import { periodOf } from '../lib/profit'

/** Tanggal kerja zona Indonesia — tutup bulan memakai tanggal lapangan, bukan UTC. */
export const jakartaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

type LedgerRow = {
  id: number
  dropDate: string
  dueDate: string
  totalDue: number
  classification: Classification
  closedPeriod: string | null
  paid: number
  balance: number
  paidInPeriod: number
}

/**
 * Posisi seluruh tagihan pada satu periode. Angsuran dijumlahkan di sini, bukan
 * dipercaya dari kolom mana pun, supaya sisa tagihan dan tunggakan selalu
 * berasal dari catatan setoran yang benar-benar tersimpan.
 */
const LEDGER_COLUMNS = {
  id: loans.id,
  dropDate: loans.dropDate,
  dueDate: loans.dueDate,
  totalDue: loans.totalDue,
  classification: loans.classification,
  closedPeriod: loans.closedPeriod,
}
async function ledger(period: string): Promise<LedgerRow[]> {
  const [loanRows, paymentRows] = await Promise.all([
    db.select(LEDGER_COLUMNS).from(loans),
    db.select({ loanId: payments.loanId, paymentDate: payments.paymentDate, amount: payments.amount }).from(payments),
  ])

  const paid = new Map<number, number>()
  const inPeriod = new Map<number, number>()
  for (const p of paymentRows) {
    paid.set(p.loanId, (paid.get(p.loanId) ?? 0) + p.amount)
    if (periodOf(p.paymentDate) === period) inPeriod.set(p.loanId, (inPeriod.get(p.loanId) ?? 0) + p.amount)
  }

  return loanRows.map(loan => {
    const total = paid.get(loan.id) ?? 0
    return {
      ...loan,
      classification: asClassification(loan.classification),
      paid: total,
      balance: Math.max(0, loan.totalDue - total),
      paidInPeriod: inPeriod.get(loan.id) ?? 0,
    }
  })
}

export type ClosingMove = { loanId: number; from: Classification; to: Classification; reason: string }
export type ClosingResult = {
  closingDate: string
  period: string
  /** Tagihan yang periodenya baru ditutup pada jalannya kali ini. */
  processed: number
  /** Tagihan yang periodenya sudah pernah ditutup — dilewati tanpa diubah. */
  skipped: number
  moves: ClosingMove[]
  counts: Record<Classification, number>
}

/**
 * Transisi berjenjang tutup bulan: PB → L, L → CM, CM → Macet. Tidak ada
 * pemulihan ke atas — tagihan yang setorannya lancar bertahan pada golongannya,
 * termasuk setelah tagihannya habis.
 *
 * Aman dijalankan berulang. Setiap tagihan menyimpan periode terakhir yang
 * sudah ditutup, jadi jalannya penjadwal pada tanggal 30 lalu 31 tidak pernah
 * menurunkan status dua tingkat dalam satu bulan. Penyesuaian manual pengelola
 * tetap dihormati: statusnya dipakai sebagai titik awal jenjang berikutnya.
 */
export async function runMonthlyClosing(closingDate = jakartaToday()): Promise<ClosingResult> {
  const period = periodOf(closingDate)
  const rows = await ledger(period)
  const counts: Record<Classification, number> = { PB: 0, L: 0, CM: 0, Macet: 0 }
  const moves: ClosingMove[] = []
  // Tagihan dikelompokkan menurut status tujuannya supaya seluruh penutupan
  // selesai dalam beberapa perintah UPDATE, bukan satu perintah per nasabah.
  const groups = new Map<Classification, { to: Classification; ids: number[] }>()
  let skipped = 0

  for (const row of rows) {
    if (row.closedPeriod && row.closedPeriod >= period) {
      skipped += 1
      counts[row.classification] += 1
      continue
    }
    const arrears = periodArrears(row, row.paidInPeriod, closingDate)
    const step = nextAtClosing(row.classification, arrears, row.balance === 0)
    const group = groups.get(step.to) ?? { to: step.to, ids: [] }
    group.ids.push(row.id)
    groups.set(step.to, group)
    counts[step.to] += 1
    if (step.changed) moves.push({ loanId: row.id, from: step.from, to: step.to, reason: step.reason })
  }

  for (const group of groups.values()) {
    await db.update(loans).set({
      classification: group.to,
      classificationSource: 'otomatis',
      classifiedAt: closingDate,
      closedPeriod: period,
    }).where(inArray(loans.id, group.ids))
  }

  if (moves.length) {
    await db.insert(classificationLogs).values(moves.map(m => ({
      loanId: m.loanId,
      fromStatus: m.from,
      toStatus: m.to,
      reason: m.reason,
      source: 'otomatis',
      effectiveDate: closingDate,
    })))
  }

  const processed = rows.length - skipped
  return { closingDate, period, processed, skipped, moves, counts }
}

/**
 * Selaraskan catatan tanggal angsuran terakhir dengan tabel angsuran. Dipakai
 * setiap kali setoran dicatat, dikoreksi, atau dihapus supaya riwayatnya tidak
 * pernah menunjuk pembayaran yang sudah tidak ada.
 *
 * Fungsi ini sengaja hanya menyentuh `lastPaymentDate`. Setoran nasabah TIDAK
 * memindahkan klasifikasi — baik menaikkan maupun menurunkan — sebab daftar
 * penagihan lapangan disusun menurut golongan dan harus tetap berada di tempat
 * yang sama sepanjang bulan. Perpindahan hanya terjadi pada tutup bulan atau
 * lewat penyesuaian manual pengelola.
 */
export async function syncLastPayment(loanId: number) {
  const [row] = await db.select({ paymentDate: payments.paymentDate })
    .from(payments)
    .where(eq(payments.loanId, loanId))
    .orderBy(desc(payments.paymentDate))
    .limit(1)
  await db.update(loans).set({ lastPaymentDate: row?.paymentDate ?? null }).where(eq(loans.id, loanId))
}

/** Penyesuaian manual pengelola, lengkap dengan jejaknya. */
export async function setClassificationManually(loanId: number, to: Classification, reason: string, onDate: string) {
  const [current] = await db.select({ classification: loans.classification })
    .from(loans).where(eq(loans.id, loanId))
  if (!current) throw new Error('Tagihan tidak ditemukan.')
  const from = asClassification(current.classification)
  const [row] = await db.update(loans).set({
    classification: to,
    classificationSource: 'manual',
    classifiedAt: onDate,
  }).where(eq(loans.id, loanId)).returning()
  if (from !== to) {
    await db.insert(classificationLogs).values({
      loanId,
      fromStatus: from,
      toStatus: to,
      reason: reason || 'Penyesuaian manual oleh pengelola.',
      source: 'manual',
      effectiveDate: onDate,
    })
  }
  return row
}

/** Jejak transisi dihapus lebih dulu: relasinya tidak memakai ON DELETE CASCADE. */
export const removeClassificationLogs = (loanIds: number[]) =>
  loanIds.length ? db.delete(classificationLogs).where(inArray(classificationLogs.loanId, loanIds)) : Promise.resolve()
