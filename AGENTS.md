# Kolekta Architecture

Kolekta is a TanStack Start application deployed on Netlify. The landing route is the complete operational workspace; navigation switches between dashboard views without a page reload.

## Key directories

- `src/routes/` contains the application shell and screens.
- `src/server/` contains typed server functions and business validation.
- `db/` contains the Drizzle schema and Netlify Database client.
- `netlify/database/migrations/` contains generated database migrations. Never edit an applied migration.
- `src/styles.css` holds the visual system and responsive layouts.

## Conventions

Use Indonesian for user-facing copy. Store money as whole rupiah integers. Loan `totalDue` is calculated server-side as 120% of principal. Never trust client totals or balances; payment validation belongs on the server. Database column names use snake_case and TypeScript properties use camelCase.

## Data flow

`getWorkspace` loads customers, loans, payments, and targets. The route derives balances and portfolio status from those records. Mutations invalidate the route after success so every summary stays synchronized.
