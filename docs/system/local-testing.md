# Local Testing Environment

This guide defines the local test workflow for the Mako monorepo.

## 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (or Docker Engine with Compose)

## 2. Test Environment Variables

1. Copy `.env.test.example` to `.env.test`.
2. Update values only if your local ports/credentials differ.

The default setup uses an isolated local Postgres database:

- host: `127.0.0.1`
- port: `54329`
- database: `mako_test`

The test database reset flow refuses to run unless `DATABASE_URL` points to localhost and a database name ending in `_test`.

## 3. One-Command Local Test Stack

Start the full stack required for local testing:

```bash
pnpm test:stack up
```

This command:

1. Starts local Postgres via `docker-compose.test.yml`
2. Resets the test database and re-runs migrations
3. Boots backend worker emulation (`@mako/backend-rest`)
4. Boots frontend local app server (`@mako/frontend`)

When you are done, stop everything cleanly:

```bash
pnpm test:stack down
```

You can also rebuild local test resources from scratch:

```bash
pnpm test:stack reset
```

## 4. Test Commands

- Run all tests: `pnpm test`
- Watch mode (all workspaces): `pnpm test:watch`
- Coverage (all workspaces): `pnpm test:coverage`

Each app/package now uses Vitest with consistent scripts:

- `test`
- `test:watch`
- `test:coverage`

## 5. Troubleshooting

### Port already in use

- `54329` conflict: update `docker-compose.test.yml` and `DATABASE_URL` in `.env.test`
- `3000` or `8787` conflict: stop the process using that port before `pnpm test:stack up`

### Docker not running

- Ensure Docker Desktop/Engine is started
- Re-run `pnpm test:stack up`

### Reset safety check fails

- Verify `DATABASE_URL` points to localhost (`localhost` or `127.0.0.1`)
- Verify the database name ends in `_test`
