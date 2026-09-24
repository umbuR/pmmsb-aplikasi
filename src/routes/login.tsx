import { createFileRoute, redirect } from '@tanstack/react-router'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AuthError,
  MissingIdentityError,
  handleAuthCallback,
  login,
  oauthLogin,
  requestPasswordRecovery,
  signup,
  updateUser,
  type AuthProvider,
} from '@netlify/identity'
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, UserRound } from 'lucide-react'
import { getLoginContext } from '../server/auth.functions'
import { AuthField } from '../components/auth/AuthField'
import { MsbWordmark } from '../components/brand/MsbMark'
import { ShowcasePanel } from '../components/auth/ShowcasePanel'
import { SocialLogin } from '../components/auth/SocialLogin'

export const Route = createFileRoute('/login')({
  loader: async () => {
    const context = await getLoginContext()
    if (context.authenticated) throw redirect({ to: '/' })
    return context
  },
  component: LoginPage,
})

type Mode = 'masuk' | 'daftar' | 'lupa' | 'sandi-baru'
type Notice = { kind: 'ok' | 'error'; text: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const REMEMBER_KEY = 'kolekta.email-tersimpan'

const copy: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  masuk: { title: 'Selamat Datang Kembali!', subtitle: 'Kelola portofolio pintar Anda hari ini.', cta: 'Masuk' },
  daftar: { title: 'Buat Akun MSB', subtitle: 'Mulai pantau arus kas Anda dalam beberapa menit.', cta: 'Daftar Sekarang' },
  lupa: { title: 'Atur Ulang Kata Sandi', subtitle: 'Kami kirim tautan pemulihan ke email Anda.', cta: 'Kirim Tautan Pemulihan' },
  'sandi-baru': { title: 'Kata Sandi Baru', subtitle: 'Buat kata sandi baru untuk mengamankan akun Anda.', cta: 'Simpan Kata Sandi' },
}

/** Kekuatan kata sandi untuk umpan balik saat mendaftar. */
function strengthOf(value: string) {
  let score = 0
  if (value.length >= 8) score++
  if (value.length >= 12) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++
  if (/\d/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++
  const label = ['Sangat lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'][Math.max(0, score - 1)] ?? 'Sangat lemah'
  return { score, label }
}

/** Menerjemahkan galat Identity menjadi pesan berbahasa Indonesia yang tidak membocorkan detail akun. */
function messageFor(error: unknown): string {
  if (error instanceof MissingIdentityError) {
    return 'Netlify Identity belum aktif di lingkungan ini. Jalankan lewat "netlify dev" atau hidupkan Identity pada proyek.'
  }
  if (error instanceof AuthError) {
    switch (error.status) {
      case 401:
        return 'Email atau kata sandi salah.'
      case 403:
        return 'Pendaftaran sedang ditutup. Hubungi pengelola koperasi untuk undangan.'
      case 404:
        return 'Akun tidak ditemukan.'
      case 422:
        return 'Data belum valid. Periksa format email dan panjang kata sandi.'
      default:
        return error.message
    }
  }
  return 'Terjadi kendala tak terduga. Coba lagi sebentar.'
}

function LoginPage() {
  const context = Route.useLoaderData()
  const [mode, setMode] = useState<Mode>('masuk')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [remember, setRemember] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [busy, setBusy] = useState<'' | 'form' | AuthProvider>('')
  const [notice, setNotice] = useState<Notice | null>(null)

  // Memproses hash balikan OAuth, konfirmasi email, dan pemulihan kata sandi.
  useEffect(() => {
    let cancelled = false
    handleAuthCallback()
      .then((result) => {
        if (!result || cancelled) return
        if (result.type === 'recovery') {
          setMode('sandi-baru')
          setNotice({ kind: 'ok', text: 'Tautan terverifikasi. Silakan buat kata sandi baru.' })
          return
        }
        if (result.type === 'invite') {
          setMode('sandi-baru')
          setNotice({ kind: 'ok', text: 'Undangan diterima. Buat kata sandi untuk mengaktifkan akun.' })
          return
        }
        window.location.href = '/'
      })
      .catch((error) => {
        if (!cancelled) setNotice({ kind: 'error', text: messageFor(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Memulihkan email yang pernah disimpan di perangkat ini.
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      setEmail(saved)
      setRemember(true)
    }
  }, [])

  const needsEmail = mode !== 'sandi-baru'
  const needsPassword = mode !== 'lupa'
  const emailValid = EMAIL_PATTERN.test(email)
  const passwordValid = password.length >= 8
  const strength = useMemo(() => strengthOf(password), [password])

  const emailError = touched.email && email.length > 0 && !emailValid ? 'Format email belum benar, contoh: nama@domain.com' : undefined
  const passwordError =
    touched.password && password.length > 0 && !passwordValid && mode !== 'masuk'
      ? 'Kata sandi minimal 8 karakter.'
      : undefined

  const canSubmit =
    !busy && (!needsEmail || emailValid) && (!needsPassword || (mode === 'masuk' ? password.length > 0 : passwordValid))

  function switchMode(next: Mode) {
    setMode(next)
    setNotice(null)
    setTouched({})
    if (next !== 'masuk') setReveal(false)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched({ email: true, password: true })
    if (!canSubmit) return

    setBusy('form')
    setNotice(null)
    try {
      if (remember && needsEmail) window.localStorage.setItem(REMEMBER_KEY, email)
      if (!remember) window.localStorage.removeItem(REMEMBER_KEY)

      if (mode === 'masuk') {
        await login(email, password)
        window.location.href = '/'
        return
      }
      if (mode === 'daftar') {
        const user = await signup(email, password, fullName.trim() ? { full_name: fullName.trim() } : undefined)
        if (user.confirmedAt) {
          window.location.href = '/'
          return
        }
        setNotice({ kind: 'ok', text: `Akun dibuat. Cek ${email} untuk tautan konfirmasi sebelum masuk.` })
        setBusy('')
        return
      }
      if (mode === 'lupa') {
        await requestPasswordRecovery(email)
        setNotice({ kind: 'ok', text: `Tautan pemulihan dikirim ke ${email}. Tautan berlaku singkat, segera periksa inbox.` })
        setBusy('')
        return
      }
      await updateUser({ password })
      window.location.href = '/'
    } catch (error) {
      setNotice({ kind: 'error', text: messageFor(error) })
      setBusy('')
    }
  }

  function onProvider(provider: AuthProvider) {
    setBusy(provider)
    setNotice(null)
    try {
      oauthLogin(provider)
    } catch (error) {
      setNotice({ kind: 'error', text: messageFor(error) })
      setBusy('')
    }
  }

  const { title, subtitle, cta } = copy[mode]
  const submitting = busy === 'form'

  return (
    <div className="lg-shell min-h-screen bg-[#f4f7f9] lg:grid lg:min-h-screen lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <ShowcasePanel />

      {/* Jalur merek ringkas untuk layar kecil, menggantikan panel kiri. */}
      <div className="lg-mesh relative overflow-hidden px-6 py-7 lg:hidden">
        <div aria-hidden className="lg-dots absolute inset-0 opacity-60" />
        <div className="relative flex items-center justify-between gap-4">
          <MsbWordmark tone="light" />
          <span className="hidden text-right text-[11px] leading-tight text-[#9fc3bb] sm:block">
            100rb+ pengguna aktif
            <br />
            Rp 2,7 T angsuran tercatat
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-7 hidden lg:block lg-rise">
            <MsbWordmark />
          </div>

          <div className="lg-rise lg-d1 rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-[0_28px_70px_-40px_rgba(15,31,46,.35)] sm:p-8">
            {mode === 'lupa' || mode === 'sandi-baru' ? (
              <button
                type="button"
                onClick={() => switchMode('masuk')}
                className="lg-display mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-600 transition-colors hover:text-emerald-700"
              >
                <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
                Kembali ke halaman masuk
              </button>
            ) : null}

            <h2 className="lg-display text-[27px] leading-tight font-extrabold tracking-tight text-[#0f1f2e] sm:text-[29px]">
              {title}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-slate-500">{subtitle}</p>

            {!context.identityReady ? (
              <div className="mt-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-amber-800">
                <AlertTriangle aria-hidden className="mt-px h-4 w-4 shrink-0" />
                <span>Identity belum aktif di lingkungan ini, jadi pengiriman formulir akan gagal sampai fitur dihidupkan.</span>
              </div>
            ) : null}

            {notice ? (
              <div
                role="status"
                className={`mt-5 flex gap-2.5 rounded-xl border p-3.5 text-[12px] leading-relaxed ${
                  notice.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {notice.kind === 'ok' ? (
                  <CheckCircle2 aria-hidden className="mt-px h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle aria-hidden className="mt-px h-4 w-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-4">
              {mode === 'daftar' ? (
                <div className="lg-rise lg-d2">
                  <AuthField
                    label="Nama Lengkap"
                    icon={UserRound}
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.currentTarget.value)}
                  />
                </div>
              ) : null}

              {needsEmail ? (
                <AuthField
                  label="Email atau Nama Pengguna"
                  icon={Mail}
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  valid={emailValid}
                  error={emailError}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                />
              ) : null}

              {needsPassword ? (
                <div>
                  <AuthField
                    label={mode === 'sandi-baru' ? 'Kata Sandi Baru' : 'Kata Sandi'}
                    icon={mode === 'sandi-baru' ? KeyRound : Lock}
                    type={reveal ? 'text' : 'password'}
                    autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'masuk' ? undefined : 8}
                    value={password}
                    error={passwordError}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setReveal((v) => !v)}
                        aria-label={reveal ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        aria-pressed={reveal}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:outline-none"
                      >
                        {reveal ? <EyeOff aria-hidden className="h-[18px] w-[18px]" /> : <Eye aria-hidden className="h-[18px] w-[18px]" />}
                      </button>
                    }
                  />

                  {mode !== 'masuk' && password.length > 0 ? (
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex flex-1 gap-1">
                        {[0, 1, 2, 3, 4].map((step) => (
                          <span
                            key={step}
                            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                              step < strength.score
                                ? strength.score <= 2
                                  ? 'bg-rose-400'
                                  : strength.score === 3
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-500'
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="w-[74px] text-right text-[10.5px] font-semibold text-slate-500">{strength.label}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {mode === 'masuk' ? (
                <div className="flex items-center justify-between gap-3">
                  <label className="group flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.currentTarget.checked)}
                      className="h-[17px] w-[17px] cursor-pointer appearance-none rounded-[5px] border border-slate-300 bg-white transition-all checked:border-emerald-500 checked:bg-emerald-500 checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.6%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3.2 8.4l3 3 6.6-6.6%22/></svg>')] checked:bg-center checked:bg-no-repeat hover:border-slate-400 focus-visible:ring-4 focus-visible:ring-emerald-100 focus-visible:outline-none"
                    />
                    <span title="Simpan email di perangkat ini">Ingat saya</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('lupa')}
                    className="lg-display text-[12.5px] font-bold text-emerald-600 underline-offset-4 transition-colors hover:text-emerald-700 hover:underline"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="lg-gloss lg-display relative mt-1 flex h-[50px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl text-[14.5px] font-extrabold tracking-tight text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
              >
                {submitting ? (
                  <>
                    <Loader2 aria-hidden className="h-[18px] w-[18px] animate-spin" />
                    Memproses…
                  </>
                ) : (
                  cta
                )}
              </button>
            </form>

            {mode === 'masuk' || mode === 'daftar' ? (
              <SocialLogin providers={context.providers} busy={Boolean(busy)} onProvider={onProvider} />
            ) : null}

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-[11.5px] font-medium text-slate-400">
              <Lock aria-hidden className="h-3.5 w-3.5 text-emerald-500" />
              Enkripsi setara bank 256-bit
            </div>
          </div>

          {mode === 'masuk' || mode === 'daftar' ? (
            <p className="lg-rise lg-d3 mt-6 text-center text-[13px] text-slate-500">
              {mode === 'masuk' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'masuk' ? 'daftar' : 'masuk')}
                disabled={mode === 'masuk' && context.disableSignup}
                className="lg-display font-bold text-emerald-600 underline-offset-4 transition-colors hover:text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline"
              >
                {mode === 'masuk' ? 'Daftar' : 'Masuk di sini'}
              </button>
              {mode === 'masuk' && context.disableSignup ? (
                <span className="mt-1 block text-[11.5px] text-slate-400">Pendaftaran ditutup — akun dibuat lewat undangan.</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
