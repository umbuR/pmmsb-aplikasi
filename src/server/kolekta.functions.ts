import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { cashBooks, classificationLogs, customers, dailyTargets, expenses, loans, payments } from '../../db/schema.js'
import { initialState, isClassification } from '../lib/classification'
import { rupiah } from '../lib/format'
import { LEGACY_KIND } from '../lib/legacy'
import { removeClassificationLogs, runMonthlyClosing, setClassificationManually, syncLastPayment } from './classification'
import { requireUser } from './auth.functions'

// Tanggal kerja memakai zona Indonesia, bukan UTC: kalau tidak, catatan yang
// dibuat sebelum jam 07.00 WIB akan jatuh ke tanggal kemarin.
const jakartaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const isIsoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Jatuh tempo transaksi saldo lama: 30 hari tenggang dihitung dari hari
 * pencatatan, supaya tunggakan pembukuan lama tidak langsung berstatus Macet
 * sebelum kolektor sempat menagihnya.
 */
const LEGACY_GRACE_DAYS = 30
const legacyDueDate = (joinedAt: string) => {
  const today = jakartaToday()
  const from = isIsoDate(joinedAt) && joinedAt > today ? joinedAt : today
  return addDays(from, LEGACY_GRACE_DAYS)
}

/** Total angsuran yang sudah masuk untuk satu pinjaman. */
async function paidOf(loanId: number) {
  const [row] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(eq(payments.loanId, loanId))
  return Number(row?.paid ?? 0)
}

/** Transaksi saldo lama milik satu nasabah, bila ada. */
async function legacyLoanOf(customerId: number) {
  const [row] = await db.select().from(loans).where(and(eq(loans.customerId, customerId), eq(loans.kind, LEGACY_KIND))).limit(1)
  return row
}

/**
 * Bukukan pinjaman nasabah lama sebagai transaksi resmi. Dua angka dicatat
 * sekaligus dan keduanya punya arti sendiri:
 *   - `principal` = jumlah pinjaman lamanya di pembukuan sebelumnya, keterangan
 *     nominal aslinya. Tidak pernah dihitung sebagai drop kas sebab uangnya
 *     keluar sebelum aplikasi ini dipakai.
 *   - `totalDue` = saldo yang masih ditagih lewat aplikasi ini. Inilah tagihan
 *     yang diangsur di menu Angsuran, jadi sisa tagihannya dihitung dari saldo
 *     ini dikurangi angsuran yang tersimpan.
 *
 * Aturan 120% tidak berlaku di sini; struktur tagihannya justru terbaca dari
 * selisih kedua angka itu. Angsuran saldonya ikut masuk Storting, Tunai, dan
 * Perkembangan seperti angsuran pinjaman baru, sebab uangnya benar-benar
 * diterima. Yang tidak pernah ikut hanya jumlah pinjaman lamanya sendiri: bukan
 * drop kas, bukan modal yang disalurkan periode ini.
 */
function insertLegacyLoan(customerId: number, principal: number, balance: number, joinedAt: string) {
  const today = jakartaToday()
  const dropDate = isIsoDate(joinedAt) ? joinedAt : today
  // Nasabah lama: status awalnya mengikuti umur tanggal dropan — bulan berjalan
  // 'PB', satu bulan sebelumnya 'L', dua bulan 'CM', tiga bulan atau lebih
  // 'Macet' — jadi tunggakan yang dibawa dari pembukuan lama langsung terbaca.
  return db.insert(loans).values({
    customerId,
    kind: LEGACY_KIND,
    dropDate,
    principal,
    totalDue: balance,
    dueDate: legacyDueDate(joinedAt),
    ...initialState(dropDate, today),
    classifiedAt: today,
  }).returning()
}

export const getWorkspace = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  const [customerRows, loanRows, paymentRows, targetRows, expenseRows, cashRows, statusRows] = await Promise.all([
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select({ id: loans.id, customerId: loans.customerId, customerName: customers.name, memberNumber: customers.memberNumber, kind: loans.kind, dropDate: loans.dropDate, principal: loans.principal, totalDue: loans.totalDue, dueDate: loans.dueDate, approval: loans.approval, classification: loans.classification, classificationSource: loans.classificationSource, classifiedAt: loans.classifiedAt, closedPeriod: loans.closedPeriod, lastPaymentDate: loans.lastPaymentDate }).from(loans).innerJoin(customers, eq(loans.customerId, customers.id)).orderBy(desc(loans.createdAt)),
    db.select().from(payments).orderBy(desc(payments.createdAt)),
    db.select().from(dailyTargets).orderBy(desc(dailyTargets.reportDate)),
    db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)),
    db.select().from(cashBooks).orderBy(desc(cashBooks.reportDate)),
    // Jejak perpindahan klasifikasi dibatasi 60 baris terbaru: cukup untuk
    // memeriksa hasil tutup bulan terakhir tanpa membebani muatan halaman.
    db.select({ id: classificationLogs.id, loanId: classificationLogs.loanId, customerName: customers.name, memberNumber: customers.memberNumber, fromStatus: classificationLogs.fromStatus, toStatus: classificationLogs.toStatus, reason: classificationLogs.reason, source: classificationLogs.source, effectiveDate: classificationLogs.effectiveDate })
      .from(classificationLogs)
      .innerJoin(loans, eq(classificationLogs.loanId, loans.id))
      .innerJoin(customers, eq(loans.customerId, customers.id))
      .orderBy(desc(classificationLogs.effectiveDate), desc(classificationLogs.id))
      .limit(60),
  ])
  return { customers: customerRows, loans: loanRows, payments: paymentRows, targets: targetRows, expenses: expenseRows, cashBooks: cashRows, statusLogs: statusRows }
})

/**
 * Baca pasangan angka pinjaman lama dari klien. Saldonya yang menentukan
 * tagihan, sedangkan jumlah pinjaman hanya keterangan nominal aslinya — karena
 * itu jumlah pinjaman yang dikosongkan dianggap sama dengan saldonya.
 *
 * Kedua angka tidak dipaksa berurutan. Di pembukuan lama tagihannya bisa lebih
 * besar dari uang yang dulu keluar, mis. pinjaman satu juta yang ditagih satu
 * juta dua ratus ribu, jadi saldo yang melampaui jumlah pinjaman tetap sah.
 * Yang dijaga hanyalah kedua angka tidak negatif; tagihan yang tidak boleh
 * turun di bawah angsuran tersimpan dijaga di pemanggilnya.
 */
function legacyPair(principalInput: unknown, balanceInput: unknown, booked = 0) {
  const balance = Math.round(Number(balanceInput) || 0)
  if (!Number.isFinite(balance) || balance < 0) throw new Error('Saldo nasabah lama tidak boleh negatif.')
  const asked = Math.round(Number(principalInput) || 0)
  if (!Number.isFinite(asked) || asked < 0) throw new Error('Jumlah pinjaman nasabah lama tidak boleh negatif.')
  return { balance, principal: asked || Math.max(balance, booked) }
}

type CustomerInput = { memberNumber: string; name: string; address: string; phone: string; nik: string; businessType: string; businessAddress: string; collector: string; resort: string; joinedAt: string; legacyPrincipal: number; legacyBalance: number }
export const addCustomer = createServerFn({ method: 'POST' }).inputValidator((d: CustomerInput) => d).handler(async ({ data }) => {
  await requireUser()
  if (!data.memberNumber.trim() || !data.name.trim() || !data.address.trim()) throw new Error('Nomor anggota, nama, dan alamat wajib diisi.')
  // NIK disimpan sebagai 16 angka tanpa spasi supaya pencarian dan pemeriksaan
  // ganda tidak terganggu cara penulisan yang berbeda-beda.
  const nik = (data.nik ?? '').replace(/\D/g, '')
  if (nik.length !== 16) throw new Error('NIK harus terdiri dari 16 angka.')
  const [duplicate] = await db.select({ name: customers.name }).from(customers).where(eq(customers.nik, nik)).limit(1)
  if (duplicate) throw new Error(`NIK ini sudah terdaftar atas nama ${duplicate.name}.`)
  const businessType = (data.businessType ?? '').trim()
  if (!businessType) throw new Error('Jenis usaha wajib diisi.')
  // Alamat usaha boleh kosong: banyak nasabah berjualan dari rumahnya sendiri,
  // jadi yang kosong dibaca sebagai sama dengan alamat rumah.
  const businessAddress = (data.businessAddress ?? '').trim()
  // Nasabah lama: jumlah pinjaman dan saldonya langsung dibukukan menjadi
  // transaksi resmi supaya tampil di menu Transaksi dan bisa diangsur seperti
  // pinjaman biasa — tanpa pernah masuk ke storting. Saldo nol berarti pinjaman
  // lamanya sudah habis, jadi tidak ada tagihan yang perlu dibuat.
  const legacy = legacyPair(data.legacyPrincipal, data.legacyBalance)
  const { legacyPrincipal: _pokok, legacyBalance: _saldo, ...profile } = data
  const [row] = await db.insert(customers).values({ ...profile, memberNumber: data.memberNumber.trim(), name: data.name.trim(), nik, businessType, businessAddress, legacyOpening: legacy.principal, legacyBalance: legacy.balance }).returning()
  if (legacy.balance > 0) {
    // Klien tidak punya transaksi basis data, jadi nasabahnya dibatalkan sendiri
    // di sini bila transaksi saldo lamanya gagal dibuat — lebih baik tidak ada
    // datanya sama sekali daripada nasabah lama tanpa tagihan yang bisa diangsur.
    try {
      await insertLegacyLoan(row.id, legacy.principal, legacy.balance, data.joinedAt)
    } catch (error) {
      await db.delete(customers).where(eq(customers.id, row.id))
      throw error
    }
  }
  return row
})

type BusinessInput = { id: number; nik: string; businessType: string; businessAddress: string }
/** Lengkapi atau perbaiki NIK dan data usaha nasabah yang sudah terdaftar. */
export const updateCustomerProfile = createServerFn({ method: 'POST' }).inputValidator((d: BusinessInput) => d).handler(async ({ data }) => {
  await requireUser()
  const nik = (data.nik ?? '').replace(/\D/g, '')
  if (nik.length !== 16) throw new Error('NIK harus terdiri dari 16 angka.')
  const businessType = (data.businessType ?? '').trim()
  if (!businessType) throw new Error('Jenis usaha wajib diisi.')
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, data.id))
  if (!customer) throw new Error('Nasabah tidak ditemukan.')
  // NIK tetap diperiksa di sini, bukan lewat batasan unik di basis data: nasabah
  // lama yang NIK-nya masih kosong akan menabrak batasan seperti itu.
  const [duplicate] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.nik, nik)).limit(1)
  if (duplicate && duplicate.id !== data.id) throw new Error(`NIK ini sudah terdaftar atas nama ${duplicate.name}.`)
  const [row] = await db.update(customers).set({ nik, businessType, businessAddress: (data.businessAddress ?? '').trim() }).where(eq(customers.id, data.id)).returning()
  return row
})

type LegacyBalanceInput = { id: number; principal: number; balance: number }
/**
 * Catat atau koreksi pinjaman nasabah lama: jumlah pinjamannya dan saldo yang
 * masih ditagih. Keduanya disimpan pada transaksi pinjaman lamanya, bukan pada
 * angka terpisah, supaya sisa tagihan yang tampil selalu berasal dari catatan
 * yang sama dengan menu Angsuran.
 *
 * Angka saldo dibaca sebagai sisa tagihan sekarang: angsuran yang sudah masuk
 * tetap dihitung, jadi tagihan yang dibukukan menjadi angsuran terbayar + saldo
 * yang dikoreksi. Nasabah yang belum punya transaksi pinjaman lama mendapatkannya
 * di sini, sehingga pinjaman lama tetap bisa dicatat setelah nasabahnya
 * terdaftar.
 */
export const updateLegacyBalance = createServerFn({ method: 'POST' }).inputValidator((d: LegacyBalanceInput) => d).handler(async ({ data }) => {
  await requireUser()
  const [customer] = await db.select().from(customers).where(eq(customers.id, data.id))
  if (!customer) throw new Error('Nasabah tidak ditemukan.')

  const legacy = await legacyLoanOf(data.id)
  if (!legacy) {
    const fresh = legacyPair(data.principal, data.balance)
    if (fresh.balance === 0) throw new Error('Saldo nasabah lama harus lebih dari nol.')
    await insertLegacyLoan(data.id, fresh.principal, fresh.balance, customer.joinedAt)
    const [created] = await db.update(customers).set({ legacyOpening: fresh.principal, legacyBalance: fresh.balance }).where(eq(customers.id, data.id)).returning()
    return created
  }

  const paid = await paidOf(legacy.id)
  // Saldo yang dikoreksi adalah sisa yang masih ditagih hari ini, sedangkan
  // `totalDue` menyimpan seluruh tagihannya. Angsuran yang sudah diterima
  // ditambahkan kembali supaya tagihannya tidak pernah turun di bawah setoran
  // yang tersimpan, seberapa kecil pun saldo yang diisi.
  const next = legacyPair(data.principal || legacy.principal, data.balance, paid + Math.round(Number(data.balance) || 0))
  const totalDue = paid + next.balance
  await db.update(loans).set({ principal: next.principal, totalDue }).where(eq(loans.id, legacy.id))
  const [row] = await db.update(customers).set({ legacyOpening: next.principal, legacyBalance: totalDue }).where(eq(customers.id, data.id)).returning()
  return row
})

type LoanInput = { customerId: number; dropDate: string; principal: number; dueDate: string }
export const addLoan = createServerFn({ method: 'POST' }).inputValidator((d: LoanInput) => d).handler(async ({ data }) => {
  await requireUser()
  const principal = Math.round(Number(data.principal))
  if (!Number.isFinite(principal) || principal <= 0) throw new Error('Besar pinjaman harus lebih dari nol.')
  // Menu Transaksi hanya membuat drop pinjaman baru — inilah transaksi yang
  // mengalir penuh ke Storting, Tunai, dan Perkembangan. Pinjaman nasabah lama
  // dicatat dari menu Data Nasabah dan sengaja berada di luar ketiga laporan itu.
  const today = jakartaToday()
  // Klasifikasi awal dibaca dari tanggal dropan: dropan bulan berjalan menjadi
  // 'PB' dan naik ke 'L' pada tutup bulan, sedangkan dropan yang dicatat
  // mundur ke bulan-bulan sebelumnya langsung menempati jenjang yang sesuai.
  const [row] = await db.insert(loans).values({
    ...data,
    kind: 'drop',
    principal,
    totalDue: Math.round(principal * 1.2),
    ...initialState(data.dropDate, today),
    classifiedAt: today,
  }).returning()
  return row
})

type PaymentInput = { loanId: number; paymentDate: string; amount: number; note: string }
export const addPayment = createServerFn({ method: 'POST' }).inputValidator((d: PaymentInput) => d).handler(async ({ data }) => {
  await requireUser()
  const amount = Math.round(Number(data.amount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Jumlah pembayaran harus lebih dari nol.')
  const [loan] = await db.select().from(loans).where(eq(loans.id, data.loanId))
  if (!loan) throw new Error('Pinjaman tidak ditemukan.')
  // Berlaku sama untuk drop pinjaman maupun transaksi saldo nasabah lama: sisa
  // tagihan selalu dihitung ulang di server dari catatan angsuran yang tersimpan.
  const paid = await paidOf(data.loanId)
  if (paid + amount > loan.totalDue) throw new Error('Pembayaran melebihi sisa tagihan.')
  const [row] = await db.insert(payments).values({ ...data, amount }).returning()
  // Setoran hanya memperbarui riwayat tanggal angsuran terakhir. Klasifikasi
  // nasabah sengaja dibiarkan di tempatnya: golongan berpindah pada tutup bulan
  // atau lewat penyesuaian manual pengelola, tidak karena ada pembayaran.
  await syncLastPayment(data.loanId)
  return row
})

type PaymentEditInput = { id: number; paymentDate: string; amount: number; note: string }
/**
 * Koreksi angsuran yang salah catat — nominal, tanggal, maupun catatannya.
 * Sisa tagihan tidak pernah dipercaya dari klien: setoran lain pada tagihan yang
 * sama dijumlahkan ulang di sini, jadi koreksinya tidak bisa membuat total
 * setoran melampaui tagihannya. Sisa tagihan nasabah langsung ikut terkoreksi
 * karena selalu dihitung dari catatan angsuran yang tersimpan.
 */
export const updatePayment = createServerFn({ method: 'POST' }).inputValidator((d: PaymentEditInput) => d).handler(async ({ data }) => {
  await requireUser()
  const amount = Math.round(Number(data.amount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Jumlah pembayaran harus lebih dari nol.')
  if (!isIsoDate(data.paymentDate)) throw new Error('Tanggal bayar wajib diisi.')
  const [payment] = await db.select().from(payments).where(eq(payments.id, data.id))
  if (!payment) throw new Error('Angsuran tidak ditemukan.')
  const [loan] = await db.select().from(loans).where(eq(loans.id, payment.loanId))
  if (!loan) throw new Error('Pinjaman tidak ditemukan.')
  const paidOthers = (await paidOf(payment.loanId)) - payment.amount
  const maxAmount = loan.totalDue - paidOthers
  if (amount > maxAmount) throw new Error(`Koreksi melebihi sisa tagihan. Nominal terbesar yang bisa dicatat ${rupiah(maxAmount)}.`)
  const [row] = await db.update(payments).set({ paymentDate: data.paymentDate, amount, note: data.note ?? '' }).where(eq(payments.id, data.id)).returning()
  // Tanggal setoran boleh berubah, jadi riwayat angsuran terakhir dihitung ulang.
  await syncLastPayment(payment.loanId)
  return row
})

type ClassificationInput = { loanId: number; classification: string; reason: string }
/**
 * Penyesuaian manual klasifikasi oleh pengelola. Nilai yang masuk diperiksa di
 * server — klien tidak bisa menyimpan status di luar empat kategori yang
 * dikenal. Status hasil penyesuaian tetap menjadi titik awal jenjang otomatis
 * berikutnya pada tutup bulan.
 */
export const setLoanClassification = createServerFn({ method: 'POST' }).inputValidator((d: ClassificationInput) => d).handler(async ({ data }) => {
  await requireUser()
  if (!isClassification(data.classification)) throw new Error('Klasifikasi status tidak dikenal.')
  return setClassificationManually(data.loanId, data.classification, (data.reason ?? '').trim(), jakartaToday())
})

/**
 * Jalankan transisi berjenjang tutup bulan sekarang. Pintu yang sama dipakai
 * penjadwal otomatis tanggal 30 — hasilnya identik, dan tagihan yang periodenya
 * sudah ditutup tidak pernah turun dua kali.
 */
export const runStatusClosing = createServerFn({ method: 'POST' }).handler(async () => {
  await requireUser()
  const result = await runMonthlyClosing(jakartaToday())
  return result
})

type TargetInput = { reportDate: string; resort: string; collectionTarget: number; dropTarget: number; notes: string }
export const saveTarget = createServerFn({ method: 'POST' }).inputValidator((d: TargetInput) => d).handler(async ({ data }) => {
  await requireUser()
  const values = { ...data, collectionTarget: Math.max(0, Math.round(Number(data.collectionTarget) || 0)), dropTarget: Math.max(0, Math.round(Number(data.dropTarget) || 0)) }
  const [row] = await db.insert(dailyTargets).values(values).onConflictDoUpdate({ target: dailyTargets.reportDate, set: values }).returning()
  return row
})

type ExpenseInput = { expenseDate: string; category: string; amount: number; note: string }
export const addExpense = createServerFn({ method: 'POST' }).inputValidator((d: ExpenseInput) => d).handler(async ({ data }) => {
  await requireUser()
  const category = data.category.trim()
  const amount = Math.round(Number(data.amount))
  if (!category) throw new Error('Jenis pengeluaran wajib diisi.')
  if (!data.expenseDate) throw new Error('Tanggal pengeluaran wajib diisi.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal pengeluaran harus lebih dari nol.')
  const [row] = await db.insert(expenses).values({ expenseDate: data.expenseDate, category, amount, note: data.note ?? '' }).returning()
  return row
})

export const removeExpense = createServerFn({ method: 'POST' }).inputValidator((d: { id: number }) => d).handler(async ({ data }) => {
  await requireUser()
  const [row] = await db.delete(expenses).where(eq(expenses.id, data.id)).returning()
  if (!row) throw new Error('Pengeluaran tidak ditemukan.')
  return row
})

type CashInput = { reportDate: string; kasbon: number; titipan: number; notes: string }
export const saveCashBook = createServerFn({ method: 'POST' }).inputValidator((d: CashInput) => d).handler(async ({ data }) => {
  await requireUser()
  if (!data.reportDate) throw new Error('Tanggal kas wajib diisi.')
  const kasbon = Math.round(Number(data.kasbon) || 0)
  const titipan = Math.round(Number(data.titipan) || 0)
  if (!Number.isFinite(kasbon) || !Number.isFinite(titipan)) throw new Error('Kasbon dan titipan harus berupa angka.')
  if (kasbon < 0 || titipan < 0) throw new Error('Kasbon dan titipan tidak boleh negatif.')

  // Hanya angka manual yang disimpan. Storting, drop 90%, dan pengeluaran selalu
  // dihitung ulang dari catatan aslinya sehingga tunai tidak bisa dikirim dari klien.
  const values = { reportDate: data.reportDate, kasbon, titipan, notes: data.notes ?? '' }
  const [row] = await db.insert(cashBooks).values(values).onConflictDoUpdate({ target: cashBooks.reportDate, set: values }).returning()
  return row
})

/* ===== Hapus catatan: setiap menu punya pintu hapusnya sendiri =====
   Relasi tidak memakai ON DELETE CASCADE, jadi anak-anak baris dihapus lebih
   dulu di sini. Pemeriksaan relasi tetap di server supaya klien tidak bisa
   menghapus nasabah yang masih punya pinjaman berjalan. */

export const removeCustomer = createServerFn({ method: 'POST' }).inputValidator((d: { id: number }) => d).handler(async ({ data }) => {
  await requireUser()
  const related = await db.select({ id: loans.id, kind: loans.kind }).from(loans).where(eq(loans.customerId, data.id))
  if (related.some(l => l.kind !== LEGACY_KIND)) throw new Error('Nasabah masih punya transaksi pinjaman. Hapus pinjamannya lebih dulu.')
  // Setiap nasabah lama punya satu baris pinjaman saldo lama. Baris itu ikut
  // terhapus di sini selama belum pernah diangsur; kalau sudah ada setorannya,
  // riwayat angsurannya tidak boleh hilang diam-diam.
  const legacyIds = related.filter(l => l.kind === LEGACY_KIND).map(l => l.id)
  if (legacyIds.length) {
    const settled = await db.select({ id: payments.id }).from(payments).where(inArray(payments.loanId, legacyIds)).limit(1)
    if (settled.length) throw new Error('Saldo lama nasabah ini masih punya angsuran tercatat. Hapus angsurannya lebih dulu.')
    await removeClassificationLogs(legacyIds)
    await db.delete(loans).where(inArray(loans.id, legacyIds))
  }
  const [row] = await db.delete(customers).where(eq(customers.id, data.id)).returning()
  if (!row) throw new Error('Nasabah tidak ditemukan.')
  return row
})

export const removeLoan = createServerFn({ method: 'POST' }).inputValidator((d: { id: number }) => d).handler(async ({ data }) => {
  await requireUser()
  const [loan] = await db.select({ id: loans.id, kind: loans.kind, customerId: loans.customerId }).from(loans).where(eq(loans.id, data.id))
  if (!loan) throw new Error('Pinjaman tidak ditemukan.')
  // Angsuran ikut terhapus: tanpa ini baris pembayaran menjadi yatim dan rekap
  // tunai tetap menghitung storting dari pinjaman yang sudah tidak ada.
  const removedPayments = await db.delete(payments).where(eq(payments.loanId, data.id)).returning({ id: payments.id })
  await removeClassificationLogs([data.id])
  const [row] = await db.delete(loans).where(eq(loans.id, data.id)).returning()
  // Menghapus transaksi saldo lama berarti nasabahnya tidak lagi punya pinjaman
  // bawaan, jadi jejak pendaftarannya di master nasabah ikut dinolkan.
  if (loan.kind === LEGACY_KIND) await db.update(customers).set({ legacyOpening: 0, legacyBalance: 0 }).where(eq(customers.id, loan.customerId))
  return { ...row, removedPayments: removedPayments.length }
})

export const removePayment = createServerFn({ method: 'POST' }).inputValidator((d: { id: number }) => d).handler(async ({ data }) => {
  await requireUser()
  const [row] = await db.delete(payments).where(eq(payments.id, data.id)).returning()
  if (!row) throw new Error('Angsuran tidak ditemukan.')
  // Riwayat tanggal angsuran terakhir dihitung ulang supaya tidak menunjuk
  // setoran yang sudah tidak ada. Klasifikasi tidak disentuh di sini — golongan
  // hanya berpindah lewat tutup bulan atau penyesuaian manual pengelola.
  await syncLastPayment(row.loanId)
  return row
})

export const removeTarget = createServerFn({ method: 'POST' }).inputValidator((d: { id: number }) => d).handler(async ({ data }) => {
  await requireUser()
  const [row] = await db.delete(dailyTargets).where(eq(dailyTargets.id, data.id)).returning()
  if (!row) throw new Error('Target tidak ditemukan.')
  return row
})

export const removeCashBook = createServerFn({ method: 'POST' }).inputValidator((d: { id: number }) => d).handler(async ({ data }) => {
  await requireUser()
  const [row] = await db.delete(cashBooks).where(eq(cashBooks.id, data.id)).returning()
  if (!row) throw new Error('Catatan kas tidak ditemukan.')
  return row
})
