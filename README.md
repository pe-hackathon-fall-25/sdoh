# SDOH Claims Bridge (Z-Codes ↔ Referrals)

Turn case notes + screenings + referrals into **payer-ready SDOH evidence packs** with human-in-the-loop Z-code suggestions.

## Quick Start (Local)

Prereqs: Node 18+, Docker, npm (v9+) and/or pnpm.

```bash
# 0) From the extracted folder:
cd sdoh-claims-bridge

# 1) Start Postgres
docker compose up -d

# 2) Install deps (root + workspaces)
npm i

# 3) Create env files
cp server/.env.example server/.env
cp web/.env.example web/.env

# 4) Prepare DB (Drizzle)
npm run db:generate
npm run db:push
npm run db:seed

# 5) Run API and Web (in two terminals)
npm run api:dev
npm run web:dev
```

Open: 
- API: http://localhost:4000
- Web app: http://localhost:5173

## What’s included
- **server/** Express + TypeScript + Drizzle (Postgres) + PDF generator
- **web/** Vite + React (demo page to create screening, get Z-codes, export PDF)
- **api/** OpenAPI stub
- **docker-compose.yml** Postgres + Adminer (http://localhost:8080)

## Next steps (optional)
- Wire real auth + tenant resolution (JWT → `x-tenant-id` header).
- Flesh out referrals/outcomes persistence and PDF timeline fetching from DB.
- Add CSV/FHIR export.
