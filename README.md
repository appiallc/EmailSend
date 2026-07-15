# MailTrack

Email outreach webapp for any business — import contacts from CSV, send personalized campaigns, track opens/clicks, and automatically follow up after one week.

## Features

- **CSV contact import** with flexible column names
- **Personalized bulk email** via SMTP (`{{first_name}}`, `{{company}}`, etc.)
- **Open & click tracking** via pixel and link redirects
- **Automatic follow-ups** after 7 days (configurable) for non-repliers
- **Reply detection** via IMAP or manual marking
- **Campaign dashboard** with send/open/reply stats

## Authentication (Google)

MailTrack requires Google sign-in. Only emails listed in `ALLOWED_EMAILS` can access the app.

1. Copy [`.env.example`](.env.example) values into `.env` / Vercel env vars.
2. Create a Google OAuth **Web** client (see comments in `.env.example`).
3. Set:
   - `AUTH_SECRET` — random 32+ char secret (`openssl rand -base64 32`)
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from Google Cloud Console
   - `ALLOWED_EMAILS` — comma-separated Google emails
4. Run `npm run dev` and open `/login`.

Public (no Google login): `/api/track/*` (tracking pixels), `/api/cron/*` (uses `CRON_SECRET`), `/api/auth/*`.

## Quick Start

```bash
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to **Sign in with Google**.

1. Go to **Settings** and configure SMTP (required to send).
2. Go to **Contacts** and create a contact list from CSV.
3. Go to **Campaigns**, create a campaign, select lists, and send.

## CSV Format

```csv
email,first_name,last_name,company,title,phone,notes
john.doe@acme.com,John,Doe,Acme Corp,CTO,+1-555-0100,Met at conference
```

Only `email` is required. Download a sample from the Contacts page or use `sample-contacts.csv`.

## Documentation

- **[Technical Documentation](docs/TECHNICAL.md)** — architecture, API reference, database schema, tracking system, deployment guide, and security notes.

## Tech Stack

Next.js 16 · React 19 · TypeScript · Prisma · SQLite · Nodemailer · Tailwind CSS

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npx prisma studio` | Database GUI |

## Production Notes

- Set **Base URL** in Settings to your public domain (required for tracking).
- Configure SPF/DKIM on your sending domain.
- Add authentication before exposing to the internet — see [Security Considerations](docs/TECHNICAL.md#security-considerations).
