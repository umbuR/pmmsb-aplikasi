# MSB

MSB is a web-based cooperative collector application adapted from the supplied Excel workbook. It centralizes customer records, loan drops, installments, daily collection totals, and resort targets in one responsive workspace.

## Technology

- TanStack Start and React
- TypeScript and Tailwind CSS
- Netlify Database with Drizzle ORM
- Netlify deployment runtime

## Run locally

Install dependencies with `pnpm install`, then run `pnpm dev`. When testing database-backed behavior locally, use Netlify Dev so the managed database integration is available.

Database migrations are generated into `netlify/database/migrations` and applied automatically during deployment.
