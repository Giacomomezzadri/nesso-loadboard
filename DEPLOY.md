# Deploy

LoadBoard runs on Giacomo's Cloudflare account (moved from nesso on 2026-11-12).

## Pieces

| What | Value |
|---|---|
| Pages project | `loziolab` (Git integration on this repo, production branch `main`) |
| Domain | `loziolab.com` (zone in the same account) and `loziolab.pages.dev` |
| Production database | D1 `loadboard` (`3d6d665f-821e-4ba2-a819-2efafccf59fd`), jurisdiction `eu` |
| Preview database | D1 `loadboard-preview` (`94b39344-9a76-4784-b28f-dbdb73d54f16`), jurisdiction `eu` |
| Node version | `.node-version` (22.12.0, needed by Vite 8) |
| Build | `pnpm build`, output `dist` |

`wrangler.jsonc` is the source of truth for the bindings. Cloudflare ignores
bindings set in the dashboard when the file is present, so change them here.
Every push to `main` deploys production. Every other branch gets a preview
deployment bound to `loadboard-preview`, never to the production database.

## Database migrations

The app does **not** apply migrations on deploy. After merging a new file in
`migrations/`, apply it yourself, **before** the code that needs it goes live:

```bash
npx wrangler d1 migrations list loadboard --remote
npx wrangler d1 migrations apply loadboard --remote          # production
npx wrangler d1 migrations apply loadboard-preview --remote --env preview  # previews
```

State on 2026-11-12: both databases have `0001`–`0015` recorded in
`d1_migrations` (there is no `0011`). `0010_player_links.sql` was never applied
on the old nesso database, so player linking did not work there; it is applied
on both new databases.

Keep `ensureColumns(...)` as a safety net only: a column it adds outside
`d1_migrations` makes the next `migrations apply` fail on "duplicate column".

## Limits (Workers Free plan)

D1 Free allows 5 M rows read and 100 k rows written per day; above that,
queries fail until midnight UTC. Peak usage before the move was about
0.7 M reads and 2.5 k writes per day.

## Backups

D1 Time Travel keeps 30 days of history on each database:

```bash
npx wrangler d1 time-travel info loadboard
npx wrangler d1 export loadboard --remote --output backup.sql
```
