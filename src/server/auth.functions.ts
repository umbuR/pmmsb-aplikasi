import { createServerFn } from '@tanstack/react-start'
import { getSettings, getUser, type AuthProvider } from '@netlify/identity'

export type SessionUser = { id: string; email: string; name: string; roles: string[] }

/** Bentuk sesi yang aman dikirim ke browser — tanpa token maupun metadata mentah. */
const toSession = (user: Awaited<ReturnType<typeof getUser>>): SessionUser | null =>
  user ? { id: user.id, email: user.email ?? '', name: user.name ?? '', roles: user.roles ?? [] } : null

/** Penjaga sesi untuk dipakai di dalam server function lain. Jangan pernah percaya klaim dari klien. */
export async function requireUser(): Promise<SessionUser> {
  const session = toSession(await getUser())
  if (!session) throw new Error('Sesi berakhir. Silakan masuk kembali.')
  return session
}

export const getSessionUser = createServerFn({ method: 'GET' }).handler(async () => toSession(await getUser()))

export type LoginContext = {
  authenticated: boolean
  identityReady: boolean
  disableSignup: boolean
  autoconfirm: boolean
  providers: Partial<Record<AuthProvider, boolean>>
}

/** Konteks halaman masuk: status sesi plus penyedia OAuth yang benar-benar aktif di proyek ini. */
export const getLoginContext = createServerFn({ method: 'GET' }).handler(async (): Promise<LoginContext> => {
  const authenticated = Boolean(await getUser())
  try {
    const settings = await getSettings()
    return {
      authenticated,
      identityReady: true,
      disableSignup: settings.disableSignup,
      autoconfirm: settings.autoconfirm,
      providers: settings.providers ?? {},
    }
  } catch {
    // Identity belum aktif di lingkungan ini — halaman tetap tampil dengan catatan penyiapan.
    return { authenticated, identityReady: false, disableSignup: false, autoconfirm: false, providers: {} }
  }
})
