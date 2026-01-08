# Claude Code Guidelines

## Project Overview

NYC Jobs data pipeline using Cloudflare Workers. Fetches job postings from NYC Open Data (Socrata), stores in R2, processes into D1 database, and serves via web UI.

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **Storage**: R2 (raw snapshots), D1 (queryable database)
- **Data Source**: NYC Open Data Socrata API

## Configuration

All configuration lives in `wrangler.toml`:
- `[vars]` for non-secret config (URLs, dataset IDs)
- Secrets via `wrangler secret put` (API keys)

Do not hardcode config values in source files.

## Project Structure

```
src/
├── index.ts          # Worker entry point
├── fetch.ts          # Scheduled fetch logic
├── process.ts        # Data transformation (TODO)
├── api.ts            # Web API routes (TODO)
├── types.ts          # Shared TypeScript types
└── lib/
    └── socrata.ts    # Socrata API client
migrations/
└── *.sql             # D1 schema migrations
```

## Conventions

### Code Style
- TypeScript strict mode
- No default exports except worker entry point
- Prefer explicit types over inference for function signatures

### Commits
- Commit completed features/fixes, not WIP
- Use conventional commit style: `feat:`, `fix:`, `chore:`, etc.

### Error Handling
- Log errors with `console.error()` (Cloudflare Workers logging)
- Throw on unrecoverable errors, return null/empty for expected missing data

## Commands

```bash
npm run dev          # Local development
npm run deploy       # Deploy to Cloudflare
npm run db:migrate   # Run D1 migrations
npx tsc --noEmit     # Type check
```

## Local Development

Wrangler uses environment-based configuration (`[env.dev]` and `[env.production]` in wrangler.toml).

**Start dev server:**
```bash
npm run dev
# or: npx wrangler dev --env dev --remote
```

**Test scheduled triggers:**
```bash
# In another terminal, trigger the cron handler:
curl http://localhost:8787/__scheduled?cron=0+4+*+*+*
```

**View logs:** Logs appear in the terminal running `wrangler dev`.

## Deployment Checklist

**One-time setup:**
1. Create R2 buckets: `wrangler r2 bucket create cityjobs-data` and `cityjobs-data-dev`
2. Create D1 database: `wrangler d1 create cityjobs-db`
3. Update `database_id` in wrangler.toml
4. Run migrations: `npm run db:migrate`
5. Set secrets: `wrangler secret put SOCRATA_APP_KEY_ID`, etc.

**Deploy:**
```bash
npm run deploy
```

## Production

**URL:** https://cityjobs-production.gstrauss5.workers.dev

**Endpoints:**
- `GET /health` - Health check

**Scheduled Jobs:**
- Cron runs daily at 4am UTC (configured in `[env.production.triggers]`)
- Fetches NYC Jobs data from Socrata API
- Stores raw snapshots in R2 bucket `cityjobs-data`

**Secrets** (set with `--env production`):
```bash
wrangler secret put SOCRATA_APP_KEY_ID --env production
wrangler secret put SOCRATA_APP_KEY_SECRET --env production
```

**View logs:**
```bash
wrangler tail --env production
```
