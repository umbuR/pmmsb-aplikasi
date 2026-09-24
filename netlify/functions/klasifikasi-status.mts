// Penjadwal transisi klasifikasi status nasabah.
//
// Berjalan pukul 23.59 WIB (16.59 UTC) pada tanggal 28–31, dan hanya bekerja
// bila tanggal Jakarta hari itu benar-benar hari tutup buku: tanggal 30, 31,
// atau hari terakhir bulan bagi bulan yang lebih pendek seperti Februari.
// Dengan begitu pergantian bulan tidak pernah terlewat, dan Februari tetap
// tertutup meski tidak punya tanggal 30.
//
// Aman dijalankan berulang: mesin transisi mencatat periode terakhir yang sudah
// ditutup pada setiap tagihan, jadi jalannya dua hari berurutan tidak akan
// menurunkan status dua tingkat dalam satu bulan.
import { isClosingDay } from '../../src/lib/classification.js'
import { jakartaToday, runMonthlyClosing } from '../../src/server/classification.js'

export default async (req: Request) => {
  const today = jakartaToday()
  const nextRun = await req.json().then((body: { next_run?: string }) => body?.next_run).catch(() => undefined)

  if (!isClosingDay(today)) {
    console.log(`[klasifikasi-status] ${today} bukan hari tutup buku, transisi dilewati. Jadwal berikutnya ${nextRun ?? 'tidak diketahui'}.`)
    return
  }

  try {
    const result = await runMonthlyClosing(today)
    const ringkasan = `PB ${result.counts.PB} · L ${result.counts.L} · CM ${result.counts.CM} · Macet ${result.counts.Macet}`
    console.log(`[klasifikasi-status] Tutup periode ${result.period} pada ${today}: ${result.processed} tagihan diproses, ${result.skipped} sudah ditutup sebelumnya, ${result.moves.length} berpindah status. ${ringkasan}`)
    for (const move of result.moves) {
      console.log(`[klasifikasi-status] Tagihan #${move.loanId}: ${move.from} -> ${move.to} (${move.reason})`)
    }
  } catch (error) {
    // Kegagalan sengaja dilempar kembali supaya jalannya penjadwal tercatat
    // gagal di log Netlify, bukan berlalu seolah-olah berhasil.
    console.error('[klasifikasi-status] Transisi gagal dijalankan.', error)
    throw error
  }
}

export const config = {
  // Menit Jam Tanggal Bulan Hari — waktu UTC. 16.59 UTC = 23.59 WIB.
  schedule: '59 16 28-31 * *',
}
