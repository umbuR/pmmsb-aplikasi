// Format angka gaya Indonesia: titik sebagai pemisah ribuan, koma sebagai desimal.
const currencyFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const decimalFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const rupiah = (n: number) => currencyFmt.format(Number.isFinite(n) ? n : 0)
export const decimal = (n: number) => decimalFmt.format(Number.isFinite(n) ? n : 0)

/** Rapikan apa yang diketik pengguna menjadi 1.250.000 atau 1.250,75 secara langsung. */
export function formatMoneyInput(input: string) {
  const cleaned = input.replace(/[^\d.,]/g, '').replace(/\./g, '')
  const comma = cleaned.indexOf(',')
  const rawInt = (comma >= 0 ? cleaned.slice(0, comma) : cleaned).replace(/^0+(?=\d)/, '')
  const grouped = rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (comma < 0) return grouped
  const rawDec = cleaned.slice(comma + 1).replace(/,/g, '').slice(0, 2)
  return `${grouped || '0'},${rawDec}`
}

/** Baca kembali angka asli dari teks yang sudah diberi titik dan koma. */
export function parseMoneyInput(input: string) {
  const cleaned = String(input ?? '').replace(/[^\d,]/g, '')
  if (!cleaned) return 0
  const [int = '', dec = ''] = cleaned.split(',')
  const value = Number(`${int || '0'}.${dec || '0'}`)
  return Number.isFinite(value) ? value : 0
}

/** Uang disimpan sebagai rupiah bulat, jadi nilai desimal dibulatkan sebelum dikirim. */
export const toWholeRupiah = (input: string) => Math.round(parseMoneyInput(input))

export const hasDecimal = (input: string) => String(input ?? '').includes(',')

// Tanggal ditampilkan singkat gaya Indonesia: 19 Sep 2026.
const shortDateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
export const shortDate = (iso: string) => (iso ? shortDateFmt.format(new Date(`${iso}T00:00:00`)) : '—')

/** Jam cetak laporan, memakai zona Indonesia supaya cocok dengan tanggal kerja. */
export const stampNow = () =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

// Sumbu grafik butuh angka pendek: Rp 1,2 jt, bukan Rp 1.200.000.
const compactFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
export function rupiahShort(n: number) {
  const abs = Math.abs(Number.isFinite(n) ? n : 0), sign = n < 0 ? '−' : ''
  if (abs >= 1e9) return `${sign}Rp ${compactFmt.format(abs / 1e9)} M`
  if (abs >= 1e6) return `${sign}Rp ${compactFmt.format(abs / 1e6)} jt`
  if (abs >= 1e3) return `${sign}Rp ${compactFmt.format(abs / 1e3)} rb`
  return `${sign}Rp ${compactFmt.format(abs)}`
}

/** NIK dibaca per empat angka — 3204 1234 5678 9012 — supaya mudah dicocokkan dengan KTP. */
export const formatNik = (nik: string) => String(nik ?? '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').trim()
