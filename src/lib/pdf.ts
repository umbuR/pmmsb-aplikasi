// Penulis PDF ringan tanpa dependensi luar. Cukup untuk laporan MSB:
// judul, ringkasan angka, dan satu tabel yang otomatis berpindah halaman.
// Memakai font bawaan PDF (Helvetica) sehingga berkasnya kecil dan tidak
// perlu menanamkan font apa pun.

const A4 = { w: 595.28, h: 841.89 }
const MARGIN = 36
const ROW_H = 18
const HEAD_H = 20
const FOOTER_H = 26

const INK = [0.06, 0.12, 0.18]
const SOFT = [0.42, 0.5, 0.59]
const LINE = [0.85, 0.9, 0.94]
const BAND = [0.94, 0.965, 0.98]
const TOTAL_BG = [0.03, 0.11, 0.19]
const PAPER = [1, 1, 1]
const ACCENT = [0.06, 0.5, 0.39]

type Font = 'r' | 'b'
type Align = 'left' | 'right'

// Lebar karakter Helvetica & Helvetica-Bold (kode 32–126, satuan 1/1000 em).
// Dibutuhkan supaya angka bisa dirapatkan ke kanan dan teks panjang dipotong tepat.
const W_REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]

// Teks laporan ditulis dengan WinAnsi, jadi karakter khas Intl (spasi tak putus,
// tanda minus matematis, titik tengah) diterjemahkan dulu ke padanan ASCII.
const SUBSTITUTE: Record<string, string> = {
  ' ': ' ', ' ': ' ', ' ': ' ',
  '−': '-', '–': '-', '—': '-',
  '·': '-', '•': '-', '×': 'x',
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '…': '...', '∅': '-',
}

function clean(input: string) {
  let out = ''
  for (const ch of String(input ?? '')) {
    for (const c of SUBSTITUTE[ch] ?? ch) {
      const code = c.charCodeAt(0)
      if (code >= 32 && code <= 126) out += c
    }
  }
  return out
}

function widthOf(text: string, size: number, font: Font) {
  const table = font === 'b' ? W_BOLD : W_REGULAR
  let units = 0
  for (const ch of text) units += table[ch.charCodeAt(0) - 32] ?? 556
  return (units * size) / 1000
}

/** Potong teks yang melebihi kolom, tetap menyisakan tanda titik-titik. */
function fit(text: string, size: number, font: Font, max: number) {
  if (!max || widthOf(text, size, font) <= max) return text
  let cut = text
  while (cut.length > 1 && widthOf(`${cut}...`, size, font) > max) cut = cut.slice(0, -1)
  return `${cut}...`
}

/** Pecah teks panjang menjadi beberapa baris selebar area cetak. */
function wrap(text: string, size: number, font: Font, max: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (widthOf(next, size, font) > max && current) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  return lines
}

export type PdfColumn = { header: string; width: number; align?: Align }
export type PdfTable = { columns: PdfColumn[]; rows: string[][]; total?: string[]; strong?: number[] }
export type PdfStat = { label: string; value: string; note?: string }
export type PdfDoc = {
  fileName: string
  kind: string
  title: string
  subtitle?: string
  meta?: string[]
  stats?: PdfStat[]
  table: PdfTable
  note?: string
  landscape?: boolean
}

export function buildPdf(doc: PdfDoc): Blob {
  const page = doc.landscape ? { w: A4.h, h: A4.w } : { ...A4 }
  const inner = page.w - MARGIN * 2
  const limit = page.h - MARGIN - FOOTER_H

  const weights = doc.table.columns.reduce((n, c) => n + c.width, 0) || 1
  const cols = doc.table.columns.map(c => ({ ...c, w: (c.width / weights) * inner }))
  const offsets: number[] = []
  cols.reduce((x, c) => { offsets.push(x); return x + c.w }, MARGIN)
  const strong = new Set(doc.table.strong ?? [])

  const pages: string[][] = []
  let ops: string[] = []
  let y = 0

  const rgb = (c: number[]) => `${c[0]} ${c[1]} ${c[2]}`
  const n = (v: number) => v.toFixed(2)

  function text(value: string, x: number, top: number, o: { size?: number; font?: Font; color?: number[]; align?: Align; max?: number } = {}) {
    const size = o.size ?? 9.5, font = o.font ?? 'r'
    const str = fit(clean(value), size, font, o.max ?? 0)
    if (!str) return
    const px = o.align === 'right' ? x - widthOf(str, size, font) : x
    const escaped = str.replace(/([\\()])/g, '\\$1')
    ops.push(`BT ${rgb(o.color ?? INK)} rg /${font === 'b' ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${n(px)} ${n(page.h - top)} Tm (${escaped}) Tj ET`)
  }
  const fillRect = (x: number, top: number, w: number, h: number, color: number[]) =>
    ops.push(`${rgb(color)} rg ${n(x)} ${n(page.h - top - h)} ${n(w)} ${n(h)} re f`)
  const strokeRect = (x: number, top: number, w: number, h: number) =>
    ops.push(`${rgb(LINE)} RG 0.7 w ${n(x)} ${n(page.h - top - h)} ${n(w)} ${n(h)} re S`)
  const hairline = (top: number) =>
    ops.push(`${rgb(LINE)} RG 0.7 w ${n(MARGIN)} ${n(page.h - top)} m ${n(page.w - MARGIN)} ${n(page.h - top)} l S`)

  function startPage() {
    ops = []
    pages.push(ops)
    y = MARGIN
    text('KOLEKTA', MARGIN, y + 8, { size: 8, font: 'b', color: ACCENT })
    text(clean(doc.kind).toUpperCase(), page.w - MARGIN, y + 8, { size: 8, font: 'b', color: SOFT, align: 'right', max: inner - 90 })
    y += 30
    text(doc.title, MARGIN, y, { size: 17, font: 'b', max: inner })
    y += 6
    if (doc.subtitle) for (const row of wrap(clean(doc.subtitle), 9, 'r', inner)) { y += 13; text(row, MARGIN, y, { size: 9, color: SOFT }) }
    if (doc.meta?.length) for (const row of wrap(clean(doc.meta.join('   -   ')), 8.5, 'b', inner)) { y += 13; text(row, MARGIN, y, { size: 8.5, font: 'b', color: INK }) }
    y += 11
    hairline(y)
    y += 20
  }

  function drawStats(items: PdfStat[]) {
    const perRow = Math.min(doc.landscape ? 4 : 3, items.length)
    const gap = 10
    const boxW = (inner - gap * (perRow - 1)) / perRow
    const boxH = 48
    items.forEach((item, i) => {
      const x = MARGIN + (i % perRow) * (boxW + gap)
      const top = y + Math.floor(i / perRow) * (boxH + gap)
      strokeRect(x, top, boxW, boxH)
      text(clean(item.label).toUpperCase(), x + 10, top + 15, { size: 6.8, font: 'b', color: SOFT, max: boxW - 20 })
      text(item.value, x + 10, top + 30, { size: 12, font: 'b', max: boxW - 20 })
      if (item.note) text(item.note, x + 10, top + 41, { size: 6.8, color: SOFT, max: boxW - 20 })
    })
    y += Math.ceil(items.length / perRow) * (boxH + gap) + 10
  }

  function drawTableHead() {
    fillRect(MARGIN, y, inner, HEAD_H, BAND)
    cols.forEach((c, i) => {
      const right = c.align === 'right'
      text(clean(c.header).toUpperCase(), right ? offsets[i] + c.w - 8 : offsets[i] + 8, y + 13.5,
        { size: 6.8, font: 'b', color: SOFT, align: right ? 'right' : 'left', max: c.w - 16 })
    })
    y += HEAD_H
  }

  startPage()
  if (doc.stats?.length) drawStats(doc.stats)
  drawTableHead()

  for (const row of doc.table.rows) {
    if (y + ROW_H > limit) { startPage(); drawTableHead() }
    hairline(y)
    cols.forEach((c, i) => {
      const right = c.align === 'right'
      text(row[i] ?? '', right ? offsets[i] + c.w - 8 : offsets[i] + 8, y + 12.5,
        { size: 8.5, font: strong.has(i) ? 'b' : 'r', color: strong.has(i) ? INK : SOFT, align: right ? 'right' : 'left', max: c.w - 16 })
    })
    y += ROW_H
  }

  if (!doc.table.rows.length) {
    hairline(y)
    text('Belum ada data yang bisa dilaporkan.', MARGIN + 8, y + 12.5, { size: 8.5, color: SOFT })
    y += ROW_H
  }

  if (doc.table.total) {
    if (y + ROW_H + 2 > limit) startPage()
    fillRect(MARGIN, y, inner, ROW_H + 4, TOTAL_BG)
    cols.forEach((c, i) => {
      const right = c.align === 'right'
      text(doc.table.total?.[i] ?? '', right ? offsets[i] + c.w - 8 : offsets[i] + 8, y + 14.5,
        { size: 9, font: 'b', color: PAPER, align: right ? 'right' : 'left', max: c.w - 16 })
    })
    y += ROW_H + 4
  } else hairline(y)

  // Catatan kaki ditulis terakhir supaya nomor halaman tahu total halamannya.
  pages.forEach((target, i) => {
    const previous = ops
    ops = target
    const base = page.h - MARGIN
    hairline(base - 12)
    if (doc.note) text(doc.note, MARGIN, base, { size: 7.5, color: SOFT, max: inner - 130 })
    text(`Halaman ${i + 1} dari ${pages.length}`, page.w - MARGIN, base, { size: 7.5, color: SOFT, align: 'right' })
    ops = previous
  })

  return assemble(pages.map(p => p.join('\n')), page)
}

/** Susun objek PDF, tabel xref, dan trailer menjadi berkas yang utuh. */
function assemble(streams: string[], page: { w: number; h: number }) {
  const encoder = new TextEncoder()
  const fontRefs = '/Font << /F1 3 0 R /F2 4 0 R >>'
  const chunks: string[] = []
  const objects: string[] = []

  const pageIds = streams.map((_, i) => 5 + i * 2)
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Count ${streams.length} /Kids [ ${pageIds.map(id => `${id} 0 R`).join(' ')} ] >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  streams.forEach((stream, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.w.toFixed(2)} ${page.h.toFixed(2)}] /Resources << ${fontRefs} >> /Contents ${pageIds[i] + 1} 0 R >>`)
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`)
  })

  chunks.push('%PDF-1.4\n')
  const xref: number[] = []
  let cursor = encoder.encode(chunks[0]).length
  objects.forEach((body, i) => {
    const piece = `${i + 1} 0 obj\n${body}\nendobj\n`
    xref.push(cursor)
    cursor += encoder.encode(piece).length
    chunks.push(piece)
  })

  const table = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
    .concat(xref.map(offset => `${String(offset).padStart(10, '0')} 00000 n `))
    .join('\n')
  chunks.push(`${table}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`)

  return new Blob([encoder.encode(chunks.join(''))], { type: 'application/pdf' })
}

/** Bangun PDF lalu serahkan ke browser sebagai unduhan. */
export function downloadPdf(doc: PdfDoc) {
  const url = URL.createObjectURL(buildPdf(doc))
  const link = document.createElement('a')
  link.href = url
  link.download = doc.fileName.endsWith('.pdf') ? doc.fileName : `${doc.fileName}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
