# IBKR Trade Journal

Daily trade recording dashboard: pulls fills from Interactive Brokers, groups them into
stock/option/forex trades, and gives you a pending-review queue where you approve each
trade and add a comment before it becomes part of your permanent record.

- `src/lib/matching.ts` — FIFO round-trip matching + multi-leg trade grouping
- `src/lib/flex.ts` / `src/lib/normalize.ts` — IBKR Flex Web Service client and normalizers
- `src/lib/ingest.ts` — rebuilds the PENDING trade queue on every run; APPROVED trades are
  never touched
- `src/app/pending`, `src/app/trades`, `src/app/summary` — the three dashboard pages
- `worker/ingest-daily.ts` — the daily cron entrypoint (Flex → matching → DB)
- `scripts/backfill-from-mcp-json.ts` — one-off historical loader from a plain
  `get_account_trades` JSON dump (no strike/expiry/put-call; used only for the initial backfill)

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL
npx prisma migrate dev
npm run dev
```

## Deploying (Railway + Supabase)

1. **Database**: create a Supabase project and copy its **Session pooler** connection string
   (Connect dialog → Session pooler tab, host like `aws-...pooler.supabase.com:5432`) — use
   this one everywhere in this app, not the Transaction pooler (`:6543`): this app's
   `@prisma/adapter-pg` setup issues real prepared statements, which the Transaction pooler's
   per-transaction connection multiplexing doesn't reliably support, despite it being
   Supabase's default recommendation for serverless workloads.

   Migrations need to run once against this string before the app can start. Do it as a
   one-off command from Railway once the `ingest-worker` service exists (step 2) — Railway's
   containers have normal network access, unlike Claude's sandboxed environment, which can
   only reach allowlisted HTTPS hosts and can't reach arbitrary Postgres ports at all:
   ```bash
   npm run db:migrate:deploy
   ```
   (Or run it from your own machine with `DATABASE_URL` set to the same string, if that's
   easier than using Railway's one-off command UI.)
2. **Railway project**: create a new Railway project from this GitHub repo, then add two
   services from the same repo:
   - **`web`** — the dashboard. Default Nixpacks build (`npm run build` / `npm start`) works
     as-is. Set `DATABASE_URL` and generate a public domain for it.
   - **`ingest-worker`** — the daily Flex pull. In its service Settings, override:
     - Start command: `npm run ingest:daily`
     - Cron Schedule: run once daily, right after US market close. Railway cron is UTC-only,
       so pick the offset for the season (e.g. `30 20 * * 1-5` for 4:30pm ET during EDT,
       `30 21 * * 1-5` during EST) — this needs a manual one-hour nudge twice a year around
       DST changes.
     - Env vars: `DATABASE_URL`, `IBKR_FLEX_TOKEN`, `IBKR_FLEX_QUERY_ID` (from IBKR Client
       Portal → Performance & Reports → Flex Queries / Settings → Flex Web Service). Never
       commit these — set them directly in Railway's dashboard.
3. Open the `web` service's domain — new trades will show up in **Pending Review** the day
   after the worker's first scheduled run.
