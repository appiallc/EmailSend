# MailTrack

Email outreach webapp for Appia (and similar teams) — import contacts from CSV, send personalized campaigns, track opens/clicks, suppress unsubscribes/hard bounces, and automatically follow up.

## Features

- **CSV contact import** with flexible column names and list search
- **Personalized bulk email** via SMTP (`{{first_name}}`, `{{company}}`, etc.)
- **Background send queue** with throttling + soft-bounce retries
- **Open & click tracking** via pixel and link redirects
- **Unsubscribe + suppression list** (manual, hard bounce, one-click List-Unsubscribe)
- **Automatic follow-ups** (multi-step) for non-repliers
- **Reply / bounce detection** via IMAP
- **Templates library** and optional **A/B subject** testing
- **Campaign dashboard** with open/reply/bounce rates
- **Google allowlist auth** (`ALLOWED_EMAILS`)

## Authentication (Google)

MailTrack requires Google sign-in. Only emails listed in `ALLOWED_EMAILS` can access the app.

1. Copy env vars from `.env` comments / docs into `.env` / Vercel.
2. Create a Google OAuth **Web** client.
3. Set:
   - `AUTH_SECRET` — random 32+ char secret (also used to encrypt SMTP/IMAP passwords at rest)
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
   - `ALLOWED_EMAILS` — comma-separated Google emails
   - `DATABASE_URL` / `DIRECT_URL` — PostgreSQL (e.g. Supabase)
   - `CRON_SECRET` — for cron-job.org hitters

Public (no Google login): `/api/track/*`, `/unsubscribe/*`, `/api/cron/*` (Bearer `CRON_SECRET`), `/api/auth/*`.

## Quick Start

```bash
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign in with Google.

1. **Settings** — SMTP (+ optional IMAP), signature, send delay.
2. **Contacts** — create a list from CSV.
3. **Templates** (optional) — save reusable copy.
4. **Campaigns** — create, schedule or send (deduped), pause/resume, track.

## CSV Format

```csv
email,first_name,last_name,company,title,phone,notes
john.doe@acme.com,John,Doe,Acme Corp,CTO,+1-555-0100,Met at conference
```

Only `email` is required. Download a sample from the Contacts page or use `sample-contacts.csv`.

## Cron (production)

Use [cron-job.org](https://cron-job.org) (or similar) against your deployed Base URL:

| Job | Interval | URL |
|-----|----------|-----|
| Outbound | every 1 min | `{baseUrl}/api/cron/outbound` |
| Replies | every 15 min | `{baseUrl}/api/cron/replies` |

Header: `Authorization: Bearer {CRON_SECRET}`

Outbound drains the send queue (~25/batch), applies send delay, requeues due soft bounces, and runs due schedules / follow-ups.

## Documentation

- **[Technical Documentation](docs/TECHNICAL.md)** — architecture, API, schema, tracking, security.

## Tech Stack

Next.js (App Router) · React · TypeScript · Prisma · **PostgreSQL** · Nodemailer · node-imap · Tailwind CSS · Auth.js (Google)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npx prisma db push` | Sync schema to Postgres |
| `npx prisma studio` | Database GUI |

## Production Notes

- Set **Base URL** in Settings to your public domain (required for tracking + unsubscribe links).
- Configure SPF/DKIM on your sending domain.
- SMTP/IMAP passwords are encrypted at rest with `AUTH_SECRET` — re-save passwords if you rotate that secret.
- Soft bounces retry up to 3 times (1h → 6h → 24h); hard bounces are suppressed permanently.
