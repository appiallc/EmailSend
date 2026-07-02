# MailTrack

Email outreach webapp for any business — import contacts from CSV, send personalized campaigns, track opens/clicks, and automatically follow up after one week.

## Features

- **CSV contact import** with flexible column names
- **Personalized bulk email** via SMTP (`{{first_name}}`, `{{company}}`, etc.)
- **Open & click tracking** via pixel and link redirects
- **Automatic follow-ups** after 7 days (configurable) for non-repliers
- **Reply detection** via IMAP or manual marking
- **Campaign dashboard** with send/open/reply stats

## Quick Start

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Go to **Settings** and configure SMTP (required to send).
2. Go to **Contacts** and upload your CSV (see `sample-contacts.csv`).
3. Go to **Campaigns**, create a campaign, edit templates, and click **Send to All**.

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
