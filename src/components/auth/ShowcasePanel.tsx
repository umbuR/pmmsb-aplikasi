import { useState } from 'react'
import { ArrowUpRight, Eye, EyeOff, Quote, ShieldCheck, TrendingDown, Users } from 'lucide-react'
import { MsbWordmark } from '../brand/MsbMark'

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)

/** Pengeluaran enam bulan terakhir — angka contoh untuk pratinjau, bukan data anggota. */
const expenses = [
  { month: 'Apr', amount: 4_820_000 },
  { month: 'Mei', amount: 5_140_000 },
  { month: 'Jun', amount: 3_960_000 },
  { month: 'Jul', amount: 6_275_000 },
  { month: 'Agu', amount: 5_680_000 },
  { month: 'Sep', amount: 4_430_000 },
]
const peak = Math.max(...expenses.map((e) => e.amount))

function ExpenseWidget() {
  const [active, setActive] = useState(expenses.length - 1)
  const current = expenses[active]
  const previous = expenses[active - 1]
  const delta = previous ? ((current.amount - previous.amount) / previous.amount) * 100 : 0

  return (
    <div className="lg-glass lg-widget-a rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-bold tracking-[.16em] text-[#8fb8ae] uppercase">Pengeluaran bulanan</span>
          <strong className="lg-display mt-1.5 block text-[25px] leading-none font-extrabold text-white">
            Rp {rupiah(current.amount)}
          </strong>
        </div>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            delta <= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'
          }`}
        >
          {delta <= 0 ? <TrendingDown aria-hidden className="h-3.5 w-3.5" /> : <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />}
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1).replace('.', ',')}%
        </span>
      </div>

      <div className="mt-5 flex h-[86px] items-end gap-2">
        {expenses.map((item, index) => (
          <button
            key={item.month}
            type="button"
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
            aria-label={`${item.month}: Rp ${rupiah(item.amount)}`}
            aria-pressed={index === active}
            className="group flex h-full flex-1 cursor-pointer flex-col justify-end gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
          >
            <span
              className={`lg-bar lg-d${index + 1} block w-full rounded-md transition-colors duration-200 ${
                index === active
                  ? 'bg-gradient-to-t from-[#25b183] to-[#7de3bd]'
                  : 'bg-white/14 group-hover:bg-white/25'
              }`}
              style={{ height: `${Math.round((item.amount / peak) * 100)}%` }}
            />
            <span className={`text-[9.5px] font-semibold ${index === active ? 'text-emerald-200' : 'text-[#7b9aa5]'}`}>
              {item.month}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BalanceWidget() {
  const [visible, setVisible] = useState(false)
  return (
    <div className="lg-glass lg-widget-b rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-full bg-emerald-400/14 px-2.5 py-1 text-[10px] font-bold tracking-[.08em] text-emerald-200 uppercase">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
          Saldo terlindungi
        </span>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
          className="rounded-lg p-1.5 text-[#9fc3bb] transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:outline-none"
        >
          {visible ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
        </button>
      </div>
      <strong className="lg-display mt-3.5 block text-[27px] leading-none font-extrabold tracking-tight text-white">
        {visible ? `Rp ${rupiah(128_475_600)}` : 'Rp •••.•••.•••'}
      </strong>
      <div className="mt-3.5 flex items-center justify-between text-[11px] text-[#9fc3bb]">
        <span>Portofolio gabungan · 3 dompet</span>
        <span className="font-semibold text-emerald-300">+4,7% bulan ini</span>
      </div>
    </div>
  )
}

function TrustWidget() {
  return (
    <div className="lg-glass-soft lg-rise lg-d5 rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/16 text-emerald-300">
          <Users aria-hidden className="h-[18px] w-[18px]" />
        </span>
        <div>
          <strong className="lg-display block text-[17px] leading-none font-extrabold text-white">100rb+ pengguna aktif</strong>
          <span className="mt-1 block text-[11px] text-[#9fc3bb]">Rp 2,7 T angsuran tercatat sejak 2022</span>
        </div>
      </div>
      <blockquote className="mt-4 border-t border-white/10 pt-4 text-[12.5px] leading-relaxed text-[#c9ded8]">
        <Quote aria-hidden className="mb-1.5 h-4 w-4 text-emerald-300/70" />
        Tutup buku harian kami turun dari dua jam jadi dua puluh menit sejak pindah ke MSB.
        <footer className="mt-2.5 text-[11px] font-semibold text-[#8fb8ae]">
          Rania Puspardana — Ketua Koperasi Sinar Tani
        </footer>
      </blockquote>
    </div>
  )
}

/** Panel merek kiri: latar mesh navy, kisi titik, dan tumpukan widget kaca yang mengapung. */
export function ShowcasePanel() {
  return (
    <section className="lg-mesh relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
      <div aria-hidden className="lg-dots absolute inset-0 opacity-70" />
      <div
        aria-hidden
        className="lg-sheen absolute -top-24 -right-20 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(125,227,189,.22),transparent_65%)] blur-2xl"
      />

      <div className="relative lg-rise-left">
        <MsbWordmark tone="light" />
      </div>

      <div className="relative my-10 max-w-[440px]">
        <h1 className="lg-display lg-rise-left lg-d1 text-[38px] leading-[1.1] font-extrabold tracking-tight text-white xl:text-[43px]">
          Uang Anda, <em className="not-italic text-[#7de3bd]">terbaca jelas</em> setiap hari.
        </h1>
        <p className="lg-rise-left lg-d2 mt-4 max-w-[400px] text-[14px] leading-relaxed text-[#a9c7c0]">
          Satu ruang kerja untuk arus kas, angsuran, dan target harian — tersinkron di semua perangkat Anda.
        </p>

        <div className="mt-8 grid gap-4">
          <ExpenseWidget />
          <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
            <BalanceWidget />
            <TrustWidget />
          </div>
        </div>
      </div>

      <div className="lg-rise-left lg-d6 relative flex items-center gap-5 text-[11px] text-[#7fa39c]">
        <span>© {new Date().getFullYear()} MSB</span>
        <span className="h-3 w-px bg-white/15" />
        <span>Kebijakan Privasi</span>
        <span className="h-3 w-px bg-white/15" />
        <span>Syarat Layanan</span>
      </div>
    </section>
  )
}
