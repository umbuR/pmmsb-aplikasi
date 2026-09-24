/** Lambang MSB: monogram huruf di dalam ubin gradien emerald–teal dengan garis pertumbuhan. */
export function MsbMark({ size = 44, tone = 'gradient' }: { size?: number; tone?: 'gradient' | 'light' }) {
  const id = `msb-mark-${tone}`
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="MSB" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tone === 'light' ? '#7de3bd' : '#25b183'} />
          <stop offset="100%" stopColor={tone === 'light' ? '#37bcb8' : '#0f8f8c'} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${id})`} />
      <text
        x="24"
        y="17"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Manrope, 'DM Sans', system-ui, sans-serif"
        fontSize="15"
        fontWeight="800"
        letterSpacing="-0.4"
        fill="#fffdf7"
      >
        MSB
      </text>
      {/* Tiga batang naik: lambang setoran yang tumbuh tiap hari. */}
      <rect x="17.25" y="32" width="3.5" height="5" rx="1.6" fill="#04222c" opacity=".45" />
      <rect x="22.25" y="29" width="3.5" height="8" rx="1.6" fill="#04222c" opacity=".62" />
      <rect x="27.25" y="26" width="3.5" height="11" rx="1.6" fill="#fffefa" opacity=".94" />
    </svg>
  )
}

/** Lambang plus nama produk, dipakai di kepala kartu masuk dan panel merek. */
export function MsbWordmark({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark'
  return (
    <div className="flex items-center gap-3">
      <MsbMark size={42} tone={dark ? 'gradient' : 'light'} />
      <div className="leading-none">
        <strong className={`lg-display block text-[21px] font-extrabold tracking-tight ${dark ? 'text-[#0f1f2e]' : 'text-white'}`}>
          MSB
        </strong>
        <span className={`mt-1 block text-[10px] font-semibold tracking-[.18em] ${dark ? 'text-[#7c8b99]' : 'text-[#8fb8ae]'}`}>
          KOPERASI SIMPAN PINJAM
        </span>
      </div>
    </div>
  )
}
