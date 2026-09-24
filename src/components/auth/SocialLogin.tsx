import type { AuthProvider } from '@netlify/identity'

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A8.99 8.99 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.34Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

function AppleLogo({ muted }: { muted?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 19" className={`h-[19px] w-[19px] ${muted ? 'fill-slate-300' : 'fill-[#0f1f2e]'}`}>
      <path d="M13.36 10.05c.02 2.4 2.1 3.2 2.13 3.21-.02.05-.33 1.13-1.1 2.24-.66.96-1.35 1.91-2.44 1.93-1.07.02-1.41-.63-2.63-.63s-1.6.61-2.61.65c-1.05.04-1.85-1.03-2.51-1.98C2.85 14.5 1.8 10.94 3.2 8.53c.7-1.2 1.94-1.96 3.29-1.98 1.03-.02 2 .69 2.63.69.62 0 1.8-.86 3.04-.73.51.02 1.96.19 2.89 1.55-.08.05-1.72 1-1.7 3Zm-2-5.87c.55-.67.93-1.6.83-2.53-.8.03-1.77.53-2.35 1.2-.51.59-.96 1.54-.84 2.45.9.07 1.8-.45 2.36-1.12Z" />
    </svg>
  )
}

const buttonBase =
  'lg-display group relative flex h-[46px] flex-1 items-center justify-center gap-2.5 rounded-xl border text-[13px] font-bold transition-all duration-200'

/**
 * Masuk satu klik. Tombol hanya aktif jika penyedia benar-benar dihidupkan pada proyek.
 * Netlify Identity mendukung Google; Apple belum tersedia sebagai penyedia sehingga ditampilkan nonaktif.
 */
export function SocialLogin({
  providers,
  busy,
  onProvider,
}: {
  providers: Partial<Record<AuthProvider, boolean>>
  busy: boolean
  onProvider: (provider: AuthProvider) => void
}) {
  const googleReady = Boolean(providers.google)

  return (
    <div>
      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-semibold tracking-[.1em] text-slate-400 uppercase">Atau lanjutkan dengan</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy || !googleReady}
          onClick={() => onProvider('google')}
          title={googleReady ? 'Masuk dengan Google' : 'Google belum dihidupkan di Identity proyek ini'}
          className={`${buttonBase} ${
            googleReady
              ? 'border-slate-200 bg-white text-[#0f1f2e] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_24px_-14px_rgba(15,31,46,.45)] disabled:translate-y-0 disabled:opacity-60'
              : 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400'
          }`}
        >
          <GoogleLogo />
          Google
        </button>

        <button
          type="button"
          disabled
          title="Apple belum tersedia sebagai penyedia Netlify Identity"
          className={`${buttonBase} cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400`}
        >
          <AppleLogo muted />
          Apple
        </button>
      </div>

      {!googleReady ? (
        <p className="mt-2.5 text-center text-[11px] text-slate-400">
          Hidupkan penyedia di <span className="font-semibold text-slate-500">Identity › External providers</span> untuk
          memakai tombol ini.
        </p>
      ) : (
        <p className="mt-2.5 text-center text-[11px] text-slate-400">Apple belum tersedia sebagai penyedia Identity.</p>
      )}
    </div>
  )
}
