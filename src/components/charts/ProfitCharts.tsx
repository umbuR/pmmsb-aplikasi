// Grafik perkembangan laba rugi. Digambar sebagai SVG inline supaya mengikuti
// sistem visual MSB, aman dirender di server, dan tetap tajam saat dizoom.
//
// Warna seri memakai palet merek yang sudah diuji terhadap permukaan putih:
// biru #2470a8 vs amber #a5701c terpisah jelas untuk semua jenis buta warna,
// sementara laba/rugi memakai hijau/merah yang selalu ditemani posisi batang
// terhadap garis nol, tanda, dan label — warna tidak pernah menjadi satu-satunya
// penanda. Aplikasi ini hanya punya permukaan terang, jadi tidak ada varian gelap.
import { useState } from 'react'
import { rupiah, rupiahShort } from '../../lib/format'
import { periodLabel, periodShort, profitTone, type ProfitPeriod } from '../../lib/profit'

const VW = 760
const VH = 264
const PAD = { top: 20, right: 16, bottom: 36, left: 78 }
const PLOT_W = VW - PAD.left - PAD.right
const PLOT_H = VH - PAD.top - PAD.bottom
const BAR_MAX = 24
const GAP = 2
const RADIUS = 4

/** Sumbu dibulatkan ke angka bulat supaya mudah dibaca. */
function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] }
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value)
  return { top, ticks }
}

/** Batang tipis dengan ujung data membulat 4px dan pangkal tetap siku di garis dasar. */
function columnPath(x: number, top: number, w: number, h: number, downward = false) {
  const r = Math.max(0, Math.min(RADIUS, h, w / 2))
  const bottom = top + h
  return downward
    ? `M${x} ${top}L${x} ${bottom - r}Q${x} ${bottom} ${x + r} ${bottom}L${x + w - r} ${bottom}Q${x + w} ${bottom} ${x + w} ${bottom - r}L${x + w} ${top}Z`
    : `M${x} ${bottom}L${x} ${top + r}Q${x} ${top} ${x + r} ${top}L${x + w - r} ${top}Q${x + w} ${top} ${x + w} ${top + r}L${x + w} ${bottom}Z`
}

type TipState = { index: number; x: number } | null

function Tip({ tip, children }: { tip: TipState; children: React.ReactNode }) {
  if (!tip) return null
  const pct = (tip.x / VW) * 100
  const shift = pct < 16 ? '0' : pct > 84 ? '-100%' : '-50%'
  return <div className="viz-tip" style={{ left: `${pct}%`, transform: `translateX(${shift})` }} role="tooltip">{children}</div>
}

function Gridlines({ ticks, scale }: { ticks: number[]; scale: (v: number) => number }) {
  return <g>{ticks.map(value => (
    <g key={value}>
      <line x1={PAD.left} x2={VW - PAD.right} y1={scale(value)} y2={scale(value)} className="viz-grid" />
      <text x={PAD.left - 10} y={scale(value) + 3.5} className="viz-tick" textAnchor="end">{value === 0 ? 'Rp 0' : rupiahShort(value)}</text>
    </g>
  ))}</g>
}

/* ===== Pendapatan jasa vs beban operasional per bulan ===== */
export function IncomeExpenseChart({ rows }: { rows: ProfitPeriod[] }) {
  const [tip, setTip] = useState<TipState>(null)
  const months = [...rows].reverse()
  const peak = Math.max(...months.map(m => Math.max(m.pendapatan, m.beban)), 0)
  const { top, ticks } = niceTicks(peak)
  const scale = (value: number) => PAD.top + PLOT_H - (value / top) * PLOT_H
  const band = PLOT_W / Math.max(1, months.length)
  const barW = Math.min(BAR_MAX, Math.max(6, (band * 0.66 - GAP) / 2))
  const hovered = tip ? months[tip.index] : null

  return (
    <article className="viz-card">
      <header>
        <div><small>PENDAPATAN VS BEBAN</small><h3>Jasa yang masuk dibanding biaya operasional</h3></div>
        <ul className="viz-legend">
          <li><i className="swatch series-1" />Pendapatan jasa</li>
          <li><i className="swatch series-2" />Beban operasional</li>
        </ul>
      </header>
      <div className="viz-plot">
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Grafik batang pendapatan jasa dan beban operasional setiap bulan. Angka lengkapnya tersedia pada tabel laba rugi di bawah.">
          <Gridlines ticks={ticks} scale={scale} />
          {months.map((month, i) => {
            const center = PAD.left + band * i + band / 2
            const leftX = center - barW - GAP / 2
            const income = (month.pendapatan / top) * PLOT_H
            const cost = (month.beban / top) * PLOT_H
            return (
              <g key={month.period}
                onMouseEnter={() => setTip({ index: i, x: center })}
                onMouseLeave={() => setTip(null)}
                onFocus={() => setTip({ index: i, x: center })}
                onBlur={() => setTip(null)}
                tabIndex={0}
                className="viz-band">
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={PLOT_H} fill="transparent" />
                <path d={columnPath(leftX, scale(month.pendapatan), barW, income)} className="viz-fill series-1" />
                <path d={columnPath(leftX + barW + GAP, scale(month.beban), barW, cost)} className="viz-fill series-2" />
                <text x={center} y={VH - PAD.bottom + 22} className="viz-axis" textAnchor="middle">{periodShort(month.period)}</text>
              </g>
            )
          })}
          <line x1={PAD.left} x2={VW - PAD.right} y1={scale(0)} y2={scale(0)} className="viz-base" />
        </svg>
        <Tip tip={tip}>
          {hovered && <>
            <strong>{periodLabel(hovered.period)}</strong>
            <span><i className="swatch series-1" />Pendapatan jasa<b>{rupiah(hovered.pendapatan)}</b></span>
            <span><i className="swatch series-2" />Beban operasional<b>{rupiah(hovered.beban)}</b></span>
            <span><i className="swatch neutral" />Laba bersih<b>{rupiah(hovered.laba)}</b></span>
          </>}
        </Tip>
      </div>
    </article>
  )
}

/* ===== Laba bersih per bulan, plus di atas garis nol dan minus di bawahnya ===== */
export function NetProfitChart({ rows }: { rows: ProfitPeriod[] }) {
  const [tip, setTip] = useState<TipState>(null)
  const months = [...rows].reverse()
  const values = months.map(m => m.laba)
  const span = Math.max(Math.abs(Math.max(...values, 0)), Math.abs(Math.min(...values, 0)), 1)
  const { top, ticks } = niceTicks(span)
  const hasLoss = values.some(v => v < 0)
  const zeroY = hasLoss ? PAD.top + PLOT_H / 2 : PAD.top + PLOT_H
  const unit = (hasLoss ? PLOT_H / 2 : PLOT_H) / top
  const scale = (value: number) => zeroY - value * unit
  const band = PLOT_W / Math.max(1, months.length)
  const barW = Math.min(BAR_MAX, Math.max(6, band * 0.44))
  const hovered = tip ? months[tip.index] : null
  // Label langsung dipakai hemat: hanya bulan terakhir dan bulan paling ekstrem.
  const extreme = values.reduce((best, value, i) => (Math.abs(value) > Math.abs(values[best]) ? i : best), 0)
  const labelled = new Set([months.length - 1, extreme])
  const axis = hasLoss ? ticks.filter(t => t > 0).flatMap(t => [t, -t]).concat(0) : ticks

  return (
    <article className="viz-card">
      <header>
        <div><small>LABA BERSIH BULANAN</small><h3>Selisih pendapatan jasa dan beban operasional</h3></div>
        <ul className="viz-legend">
          <li><i className="swatch positive" />Laba</li>
          <li><i className="swatch negative" />Rugi</li>
        </ul>
      </header>
      <div className="viz-plot">
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="Grafik batang laba bersih setiap bulan. Batang di atas garis nol berarti laba, di bawahnya berarti rugi. Angka lengkapnya tersedia pada tabel laba rugi di bawah.">
          <g>{axis.map(value => (
            <g key={value}>
              <line x1={PAD.left} x2={VW - PAD.right} y1={scale(value)} y2={scale(value)} className="viz-grid" />
              <text x={PAD.left - 10} y={scale(value) + 3.5} className="viz-tick" textAnchor="end">{value === 0 ? 'Rp 0' : rupiahShort(value)}</text>
            </g>
          ))}</g>
          {months.map((month, i) => {
            const center = PAD.left + band * i + band / 2
            const down = month.laba < 0
            const height = Math.abs(month.laba) * unit
            const tone = down ? 'negative' : 'positive'
            return (
              <g key={month.period}
                onMouseEnter={() => setTip({ index: i, x: center })}
                onMouseLeave={() => setTip(null)}
                onFocus={() => setTip({ index: i, x: center })}
                onBlur={() => setTip(null)}
                tabIndex={0}
                className="viz-band">
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={PLOT_H} fill="transparent" />
                <path d={columnPath(center - barW / 2, down ? zeroY : zeroY - height, barW, height, down)} className={`viz-fill ${tone}`} />
                {labelled.has(i) && month.laba !== 0 &&
                  <text x={center} y={down ? Math.min(scale(month.laba) + 14, PAD.top + PLOT_H + 8) : Math.max(scale(month.laba) - 8, 12)} className="viz-value" textAnchor="middle">{rupiahShort(month.laba)}</text>}
                <text x={center} y={VH - PAD.bottom + 22} className="viz-axis" textAnchor="middle">{periodShort(month.period)}</text>
              </g>
            )
          })}
          <line x1={PAD.left} x2={VW - PAD.right} y1={zeroY} y2={zeroY} className="viz-base" />
        </svg>
        <Tip tip={tip}>
          {hovered && <>
            <strong>{periodLabel(hovered.period)}</strong>
            <span><i className={`swatch ${hovered.laba < 0 ? 'negative' : 'positive'}`} />{profitTone(hovered.laba).label} bersih<b>{rupiah(hovered.laba)}</b></span>
            <span><i className="swatch neutral" />Pendapatan jasa<b>{rupiah(hovered.pendapatan)}</b></span>
            <span><i className="swatch neutral" />Beban operasional<b>{rupiah(hovered.beban)}</b></span>
          </>}
        </Tip>
      </div>
    </article>
  )
}
