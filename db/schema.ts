import { check, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Turso/SQLite tidak punya tipe khusus tanggal maupun timestamp. Tanggal bisnis
// disimpan sebagai teks 'YYYY-MM-DD' — bentuk yang sama yang dulu dikembalikan
// kolom `date` Postgres, jadi seluruh perbandingan tanggal di aplikasi tetap
// berjalan tanpa perubahan. Jejak waktu pembuatan memakai 'YYYY-MM-DD HH:MM:SS'
// supaya pengurutan teks sama dengan pengurutan waktu.
const createdAt = () => text('created_at').notNull().default(sql`(current_timestamp)`)

export const customers = sqliteTable('customers', {
  id: integer().primaryKey({ autoIncrement: true }),
  memberNumber: text('member_number').notNull().unique(),
  name: text().notNull(),
  address: text().notNull(),
  phone: text().notNull(),
  // Identitas dan profil usaha nasabah. Bawaan string kosong supaya data nasabah
  // yang sudah terdaftar sebelum kolom ini ada tetap terbaca.
  nik: text().notNull().default(''),
  businessType: text('business_type').notNull().default(''),
  businessAddress: text('business_address').notNull().default(''),
  collector: text().notNull(),
  resort: text().notNull().default('Resort Utama'),
  joinedAt: text('joined_at').notNull(),
  status: text().notNull().default('Aktif'),
  // Jejak pendaftaran pinjaman nasabah lama. Sisa tagihan yang berlaku TIDAK
  // dibaca dari sini melainkan dari baris `loans` berjenis 'lama' milik nasabah
  // ini, supaya angsurannya bisa dicatat lewat menu Angsuran seperti biasa —
  // meski nominalnya sengaja tidak mengalir ke storting, tunai, dan laba rugi.
  // legacyOpening = saldo lama saat pertama dicatat, legacyBalance = nilai tagihan
  // saldo lama yang terakhir dibukukan.
  legacyOpening: integer('legacy_opening').notNull().default(0),
  legacyBalance: integer('legacy_balance').notNull().default(0),
  createdAt: createdAt(),
})

export const loans = sqliteTable('loans', {
  id: integer().primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  // 'drop'  = pinjaman baru, uangnya benar-benar keluar hari itu (tagihan 120%).
  // 'lama'  = pinjaman bawaan nasabah lama. `principal` menyimpan jumlah pinjaman
  //           lamanya dan `total_due` saldo yang masih ditagih. Saldonya diangsur
  //           seperti biasa dan angsurannya ikut storting, tunai, serta laba rugi;
  //           jumlah pinjamannya tidak boleh dihitung sebagai drop kas sebab
  //           uangnya keluar sebelum aplikasi ini dipakai.
  kind: text().notNull().default('drop'),
  dropDate: text('drop_date').notNull(),
  principal: integer().notNull(),
  totalDue: integer('total_due').notNull(),
  dueDate: text('due_date').notNull(),
  approval: text().notNull().default('Disetujui'),
  // Klasifikasi status nasabah: 'PB' | 'L' | 'CM' | 'Macet'. Menempel pada
  // tagihan karena status awalnya ditentukan tanggal dropan, dan satu nasabah
  // bisa punya drop baru sekaligus saldo lama yang sudah menunggak.
  classification: text().notNull().default('PB'),
  // 'otomatis' bila status terakhir dipasang penjadwal tutup bulan, 'manual' bila
  // disesuaikan pengelola. Nilai 'pembayaran' hanya tersisa pada data lama:
  // setoran nasabah tidak lagi memindahkan klasifikasi.
  classificationSource: text('classification_source').notNull().default('otomatis'),
  classifiedAt: text('classified_at'),
  // Periode terakhir yang sudah dilewati transisi berjenjang, mis. '2026-09'.
  // Penjaga agar satu tagihan hanya turun satu tingkat per bulan meski
  // penjadwalnya berjalan lagi pada hari berikutnya.
  closedPeriod: text('closed_period'),
  // Riwayat tanggal angsuran terakhir: dasar pemeriksaan tunggakan tanpa harus
  // menelusuri seluruh tabel angsuran.
  lastPaymentDate: text('last_payment_date'),
  // Peninggalan aturan lama: dulu menyimpan tanggal tunggakan CM/Macet
  // diselesaikan. Tidak lagi ditulis maupun dibaca — penanda Lunas Macet kini
  // dihitung dari sisa tagihan. Kolomnya dibiarkan agar migrasi yang sudah
  // diterapkan tetap cocok dengan skema.
  recoveredAt: text('recovered_at'),
  createdAt: createdAt(),
}, table => [
  // Klasifikasi dijaga di basis data juga, bukan hanya di server function:
  // hanya empat nilai yang dikenal sistem yang boleh tersimpan.
  check('loans_classification_valid', sql`${table.classification} in ('PB', 'L', 'CM', 'Macet')`),
])

/**
 * Jejak perpindahan klasifikasi. Setiap transisi otomatis maupun penyesuaian
 * manual dicatat di sini supaya pengelola bisa memeriksa alasan sebuah tagihan
 * berpindah status, termasuk yang dikerjakan penjadwal tutup bulan.
 */
export const classificationLogs = sqliteTable('classification_logs', {
  id: integer().primaryKey({ autoIncrement: true }),
  loanId: integer('loan_id').notNull().references(() => loans.id),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  reason: text().notNull().default(''),
  source: text().notNull().default('otomatis'),
  effectiveDate: text('effective_date').notNull(),
  createdAt: createdAt(),
})

export const payments = sqliteTable('payments', {
  id: integer().primaryKey({ autoIncrement: true }),
  loanId: integer('loan_id').notNull().references(() => loans.id),
  paymentDate: text('payment_date').notNull(),
  amount: integer().notNull(),
  note: text().notNull().default(''),
  createdAt: createdAt(),
})

export const dailyTargets = sqliteTable('daily_targets', {
  id: integer().primaryKey({ autoIncrement: true }),
  reportDate: text('report_date').notNull().unique(),
  resort: text().notNull(),
  collectionTarget: integer('collection_target').notNull(),
  dropTarget: integer('drop_target').notNull(),
  notes: text().notNull().default(''),
  createdAt: createdAt(),
})

export const expenses = sqliteTable('expenses', {
  id: integer().primaryKey({ autoIncrement: true }),
  expenseDate: text('expense_date').notNull(),
  category: text().notNull(),
  amount: integer().notNull(),
  note: text().notNull().default(''),
  createdAt: createdAt(),
})

export const cashBooks = sqliteTable('cash_books', {
  id: integer().primaryKey({ autoIncrement: true }),
  reportDate: text('report_date').notNull().unique(),
  kasbon: integer().notNull().default(0),
  titipan: integer().notNull().default(0),
  notes: text().notNull().default(''),
  createdAt: createdAt(),
})
