import { defineConfig } from 'drizzle-kit'

// Migrasi Turso punya jalur sendiri di `drizzle/migrations`. Berkas di
// `netlify/database/migrations` adalah riwayat Postgres yang sudah diterapkan:
// dialeknya berbeda dan tidak boleh diubah maupun dihapus, jadi dibiarkan utuh.
export default defineConfig({
  dialect: 'turso',
  schema: './db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
})
