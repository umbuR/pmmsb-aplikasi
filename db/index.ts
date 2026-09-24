import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema.js'

/**
 * Koneksi Turso. Kredensialnya hanya dibaca dari Project Configuration Netlify
 * dan tidak pernah ditulis ke dalam repositori. `@libsql/client` sendiri yang
 * memilih transport: di Netlify ia memakai varian HTTP murni, jadi tidak ada
 * binding native yang perlu ikut dibundel ke function.
 */
function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variabel lingkungan ${name} belum diatur di Project Configuration Netlify.`)
  return value
}

export const client = createClient({
  url: requiredEnv('TURSO_DATABASE_URL'),
  authToken: requiredEnv('TURSO_AUTH_TOKEN'),
})

export const db = drizzle({ client, schema })
