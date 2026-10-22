# Flash Sale System

## Quick Start

Requires Docker with Compose v2. No `.env` file is needed; defaults are built in.

```bash
docker compose up --build
```

Open http://localhost. The page shows the result of `GET /api/health`.
Refreshing alternates the `hostname` between `api1` and `api2` (load balanced by nginx).

## Local Development

Requires Node.js 20.

```bash
cp .env.example .env           # optional, to override defaults
docker compose up postgres redis

# terminal 2
cd api && npm install && npm run start:dev    # http://localhost:3000/api/health

# terminal 3
cd web && npm install && npm run dev          # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:3000`.

`db/init.sql` runs only once, when the Postgres volume is empty. After changing the schema,
remove the volume and start again: `docker compose down -v && docker compose up --build`.
