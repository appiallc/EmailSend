# MailTrack — Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Database Schema](#database-schema)
6. [Core Modules](#core-modules)
7. [API Reference](#api-reference)
8. [Email Lifecycle](#email-lifecycle)
9. [Tracking System](#tracking-system)
10. [Follow-up Scheduler](#follow-up-scheduler)
11. [Reply Detection](#reply-detection)
12. [CSV Import Specification](#csv-import-specification)
13. [Template Personalization](#template-personalization)
14. [Configuration](#configuration)
15. [Environment Variables](#environment-variables)
16. [Development](#development)
17. [Production Deployment](#production-deployment)
18. [Security Considerations](#security-considerations)
19. [Known Limitations](#known-limitations)
20. [Future Improvements](#future-improvements)

---

## Overview

**MailTrack** is a self-hosted web application for email outreach campaigns. It allows teams to:

- Import contact lists from CSV files
- Create and send personalized bulk email campaigns via SMTP
- Track email opens and link clicks
- Automatically send follow-up emails after a configurable delay (default: 7 days)
- Detect replies via IMAP or manual marking

The application is built as a monolithic Next.js app with server-side API routes, a SQLite database, and background cron jobs started via Next.js instrumentation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React)                          │
│  Dashboard │ Contacts │ Campaigns │ Settings                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (REST API)
┌────────────────────────────▼────────────────────────────────────┐
│                    Next.js App Router (Node.js)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ API Routes  │  │ Server Libs  │  │ instrumentation.ts      │ │
│  │ /api/*      │──│ campaign     │  │ → node-cron scheduler   │ │
│  └─────────────┘  │ email        │  └─────────────────────────┘ │
│                   │ csv, replies │                                 │
│                   └──────┬───────┘                                 │
│                          │                                         │
│                   ┌──────▼───────┐                                 │
│                   │ Prisma ORM   │                                 │
│                   │ SQLite (dev) │                                 │
│                   └──────────────┘                                 │
└────────────┬───────────────────────────────┬──────────────────────┘
             │ SMTP (nodemailer)              │ IMAP (optional)
             ▼                                ▼
      Email Provider                   Inbox (reply detection)
   (Gmail, Outlook, SendGrid)         (Gmail, Outlook, etc.)
```

### Request flow — sending a campaign

1. User clicks **Send to All** on the Campaigns page.
2. `POST /api/campaigns/send` is called with `{ campaignId, action: "send" }`.
3. `createCampaignWithContacts()` creates `EmailLog` records (one per contact, type `initial`, status `pending`).
4. `sendCampaignEmails()` iterates pending logs, renders templates, injects tracking, and sends via SMTP.
5. Each sent log is updated with `status: sent`, `sentAt`, `messageId`, and `followUpDue` (now + `followUpDays`).
6. Campaign status is set to `sent` when all initial emails are processed.

### Request flow — open tracking

1. Recipient's email client loads the tracking pixel: `GET /api/track/open/{trackingId}`.
2. Server looks up `EmailLog` by `trackingId`.
3. If not previously opened, sets `openedAt` and upgrades status from `sent` → `opened`.
4. Returns a 1×1 transparent GIF.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | Full-stack React application |
| Language | TypeScript | Type safety |
| UI | React 19, Tailwind CSS 4 | Frontend components and styling |
| Database | SQLite + Prisma 6 | Local persistence |
| Email (outbound) | Nodemailer | SMTP sending |
| Email (inbound) | node-imap + mailparser | Reply detection |
| CSV parsing | PapaParse | Contact import |
| Scheduling | node-cron | Background follow-up and reply checks |

---

## Project Structure

```
emailsend/
├── prisma/
│   ├── schema.prisma          # Database models
│   └── migrations/            # Migration history
├── src/
│   ├── app/
│   │   ├── page.tsx           # Dashboard
│   │   ├── contacts/page.tsx  # CSV import & contact list
│   │   ├── campaigns/page.tsx # Campaign CRUD, send, tracking
│   │   ├── settings/page.tsx  # SMTP/IMAP configuration
│   │   └── api/               # REST API endpoints
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   └── StatCard.tsx
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── csv.ts             # CSV parsing & column mapping
│   │   ├── templates.ts       # Default templates & {{tag}} rendering
│   │   ├── email.ts           # SMTP send + tracking injection
│   │   ├── campaign.ts        # Campaign send & follow-up logic
│   │   ├── replies.ts         # IMAP reply detection
│   │   └── scheduler.ts       # Cron job definitions
│   └── instrumentation.ts     # Starts scheduler on server boot
├── sample-contacts.csv        # Example import file
├── docs/
│   └── TECHNICAL.md           # This document
└── .env                       # DATABASE_URL and secrets
```

---

## Database Schema

### Contact

Stores imported leads. Email is unique (case-normalized to lowercase on import).

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (cuid) | Primary key |
| `email` | String | Unique, required |
| `firstName` | String | First name |
| `lastName` | String | Last name |
| `company` | String | Company name |
| `title` | String | Job title |
| `phone` | String | Phone number |
| `notes` | String | Free-text notes |
| `createdAt` | DateTime | Import timestamp |

### Campaign

Defines an outreach campaign with initial and follow-up email templates.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (cuid) | Primary key |
| `name` | String | Display name |
| `subject` | String | Initial email subject (supports `{{tags}}`) |
| `bodyHtml` | String | Initial email HTML body |
| `followUpSubject` | String | Follow-up subject |
| `followUpBodyHtml` | String | Follow-up HTML body |
| `followUpDays` | Int | Days after initial send before follow-up (default: 7) |
| `status` | String | `draft` \| `sending` \| `sent` \| `paused` |
| `createdAt` | DateTime | Creation timestamp |
| `sentAt` | DateTime? | When all initial emails were sent |

### EmailLog

One record per email sent (or pending) to a contact within a campaign.

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (cuid) | Primary key |
| `campaignId` | String | FK → Campaign |
| `contactId` | String | FK → Contact |
| `type` | String | `initial` \| `followup` |
| `status` | String | See [status state machine](#email-status-state-machine) |
| `trackingId` | String (cuid) | Unique ID used in tracking URLs |
| `messageId` | String? | RFC 5322 Message-ID for reply threading |
| `error` | String? | Error message if send failed |
| `sentAt` | DateTime? | When email was sent |
| `openedAt` | DateTime? | First open timestamp |
| `clickedAt` | DateTime? | First click timestamp |
| `repliedAt` | DateTime? | Reply timestamp |
| `followUpDue` | DateTime? | Scheduled follow-up date (initial emails only) |

**Indexes:** `campaignId`, `contactId`, `followUpDue`

### Settings

Singleton configuration row (`id = "default"`).

| Column | Type | Description |
|--------|------|-------------|
| `companyName` | String | Display name |
| `smtpHost` | String | SMTP server hostname |
| `smtpPort` | Int | SMTP port (587 or 465) |
| `smtpSecure` | Boolean | `true` for SSL (port 465) |
| `smtpUser` | String | SMTP username |
| `smtpPass` | String | SMTP password (stored in DB) |
| `smtpFrom` | String | From address |
| `imapHost` | String | IMAP server (optional) |
| `imapPort` | Int | IMAP port (default: 993) |
| `imapUser` | String | IMAP username |
| `imapPass` | String | IMAP password |
| `baseUrl` | String | Public app URL for tracking pixels |

---

## Core Modules

### `src/lib/db.ts`

- Exports a Prisma client singleton (reused in development to avoid connection exhaustion).
- `getSettings()` — fetches or creates the default settings row.

### `src/lib/csv.ts`

- `parseContactsCsv(csvText)` — parses CSV with flexible column name aliases.
- Validates email format, deduplicates within the file, returns `{ contacts, errors }`.
- `CSV_FORMAT` — canonical example string for documentation/UI.

### `src/lib/templates.ts`

- `renderTemplate(template, contact)` — replaces `{{tag}}` placeholders with contact fields.
- Exports default initial and follow-up subject/body templates.

### `src/lib/email.ts`

- `createTransporter(settings)` — builds a Nodemailer SMTP transport.
- `injectTracking(html, baseUrl, trackingId)` — appends open pixel; rewrites `href` links for click tracking.
- `sendTrackedEmail(opts)` — renders template, injects tracking, sends email with custom `Message-ID`.

### `src/lib/campaign.ts`

- `createCampaignWithContacts(campaignId, contactIds?)` — creates pending `EmailLog` rows.
- `sendCampaignEmails(campaignId, type)` — sends all pending logs of given type.
- `processDueFollowUps()` — finds due initial emails, creates follow-up logs, sends them.

### `src/lib/replies.ts`

- `checkForReplies()` — connects to IMAP, scans unread messages, matches replies to `EmailLog` records.

### `src/lib/scheduler.ts`

- Registers two cron jobs on server startup (via `instrumentation.ts`).

---

## API Reference

All endpoints return JSON unless noted.

### `GET /api/stats`

Dashboard statistics.

**Response:**
```json
{
  "contacts": 42,
  "campaigns": 3,
  "statusCounts": { "sent": 10, "opened": 5, "replied": 2 },
  "smtpConfigured": true,
  "recentCampaigns": [
    {
      "id": "clx...",
      "name": "Q1 Outreach",
      "status": "sent",
      "total": 20,
      "sent": 20,
      "opened": 8,
      "replied": 2
    }
  ]
}
```

---

### `GET /api/contacts`

List all contacts (newest first).

### `POST /api/contacts`

Import contacts or create a single contact.

**CSV import:**
```json
{ "csv": "email,first_name,last_name\njohn@acme.com,John,Doe" }
```

**Single contact:**
```json
{
  "email": "john@acme.com",
  "firstName": "John",
  "lastName": "Doe",
  "company": "Acme Corp"
}
```

**Response (CSV):**
```json
{ "imported": 5, "errors": ["Row 3: missing or invalid email"], "total": 5 }
```

### `DELETE /api/contacts?id={contactId}`

Delete a contact (cascades to related `EmailLog` records).

---

### `GET /api/campaigns`

List all campaigns with nested `emailLogs` and `contact` data.

### `POST /api/campaigns`

Create a new campaign.

```json
{
  "name": "Q1 Outreach",
  "subject": "Hello {{first_name}}",
  "bodyHtml": "<p>Hi {{first_name}},</p>",
  "followUpSubject": "Following up",
  "followUpBodyHtml": "<p>Just checking in...</p>",
  "followUpDays": 7
}
```

### `PATCH /api/campaigns`

Update an existing campaign.

```json
{ "id": "clx...", "name": "Updated Name", "followUpDays": 14 }
```

### `DELETE /api/campaigns?id={campaignId}`

Delete a campaign and all related email logs.

---

### `POST /api/campaigns/send`

Prepare or send a campaign.

**Prepare (create pending logs only):**
```json
{ "campaignId": "clx...", "action": "prepare", "contactIds": ["id1", "id2"] }
```

**Send to all contacts:**
```json
{ "campaignId": "clx...", "action": "send" }
```

**Response:**
```json
{ "sent": 18, "failed": 2, "total": 20 }
```

---

### `GET /api/settings`

Returns settings with passwords masked as `••••••••`.

### `PUT /api/settings`

Update settings. Omit password fields or send `••••••••` to keep existing values.

```json
{
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "smtpUser": "you@company.com",
  "smtpPass": "app-password",
  "smtpFrom": "you@company.com",
  "baseUrl": "https://mailtrack.yourcompany.com"
}
```

---

### `PATCH /api/email-logs`

Manually update an email log status (e.g. mark as replied).

```json
{ "id": "clx...", "status": "replied" }
```

---

### `GET /api/track/open/{trackingId}`

Open tracking pixel. Returns `image/gif` (1×1 transparent). No authentication.

### `GET /api/track/click/{trackingId}?url={encodedUrl}`

Click tracking redirect. Records click, then HTTP 302 redirects to the original URL.

---

### `POST /api/scheduler/run`

Manually trigger reply check and follow-up processing.

**Response:**
```json
{ "replies": 1, "followUps": 3 }
```

---

## Email Lifecycle

### Email status state machine

```
pending → sent → opened → clicked
              ↘ failed
              ↘ replied (from any sent/opened/clicked state)
```

| Status | Meaning |
|--------|---------|
| `pending` | Queued, not yet sent |
| `sent` | Successfully delivered via SMTP |
| `failed` | SMTP error; see `error` column |
| `opened` | Tracking pixel was loaded |
| `clicked` | A tracked link was clicked |
| `replied` | Reply detected (IMAP or manual) |

`replied` is a terminal state — follow-ups are not sent to contacts with this status.

### Follow-up eligibility

A follow-up is created when **all** of the following are true:

1. Initial `EmailLog` has `status` in `sent`, `opened`, or `clicked`
2. `followUpDue` ≤ current time
3. No existing `followup` log for that contact + campaign
4. No log with `status: replied` for that contact + campaign
5. Campaign has non-empty `followUpSubject` and `followUpBodyHtml`

Follow-up emails use `In-Reply-To` and `References` headers pointing to the initial email's `messageId`, so they appear as threaded replies in the recipient's inbox.

---

## Tracking System

### Open tracking

A 1×1 `<img>` tag is appended to every outgoing email:

```html
<img src="{baseUrl}/api/track/open/{trackingId}" width="1" height="1" alt="" style="display:none" />
```

**Caveats:**
- Many email clients block images by default (Gmail, Outlook).
- Apple Mail Privacy Protection pre-fetches images, which can inflate open counts.
- Opens are best treated as directional signals, not exact metrics.

### Click tracking

All `href="https://..."` links in the HTML body are rewritten to:

```
{baseUrl}/api/track/click/{trackingId}?url={encodedOriginalUrl}
```

The click endpoint records the event and redirects (302) to the original URL.

**Caveats:**
- Only double-quoted `href` attributes matching `https?://` are rewritten.
- Plain-text links or single-quoted attributes are not tracked.

### Message-ID for reply threading

Each sent email gets a deterministic Message-ID:

```
<{trackingId}@{hostname-from-baseUrl}>
```

This ID is stored in `EmailLog.messageId` and used by IMAP reply detection.

---

## Follow-up Scheduler

Started automatically when the Next.js server boots (`src/instrumentation.ts` → `src/lib/scheduler.ts`).

| Job | Cron expression | Action |
|-----|-----------------|--------|
| Reply check | `*/15 * * * *` (every 15 min) | `checkForReplies()` |
| Follow-up send | `0 * * * *` (every hour) | `processDueFollowUps()` |

Both jobs log results to the server console. Use `POST /api/scheduler/run` to trigger manually from the Settings page.

**Important:** The scheduler only runs while the Node.js process is alive. If the server is stopped, follow-ups and reply checks are paused until it restarts.

---

## Reply Detection

### Automatic (IMAP)

When IMAP is configured in Settings:

1. Connect to inbox via TLS.
2. Search for `UNSEEN` messages.
3. For each message, parse `In-Reply-To` and `References` headers.
4. Extract `trackingId` from Message-ID pattern: `<{trackingId}@...>`.
5. If no match, fall back to matching sender email against `Contact.email`.
6. Update matching `EmailLog` to `status: replied`.
7. Mark message as seen in IMAP.

### Manual

Users can click **Mark replied** on the campaign tracking view, which calls `PATCH /api/email-logs` with `status: "replied"`.

---

## CSV Import Specification

### Required columns

| Column | Required | Description |
|--------|----------|-------------|
| `email` | **Yes** | Valid email address |

### Optional columns

| Column | Aliases accepted |
|--------|-----------------|
| `first_name` | `firstname`, `first`, `fname` |
| `last_name` | `lastname`, `last`, `lname` |
| `company` | `organization`, `org` |
| `title` | `job_title`, `position`, `role` |
| `phone` | `mobile`, `telephone`, `tel` |
| `notes` | `note`, `comments` |

### Example file

```csv
email,first_name,last_name,company,title,phone,notes
john.doe@acme.com,John,Doe,Acme Corp,CTO,+1-555-0100,Met at conference
jane.smith@techco.io,Jane,Smith,TechCo,IT Director,+1-555-0101,Referred by partner
```

### Import behavior

- Headers are case-insensitive; spaces are normalized to underscores.
- Duplicate emails within the same file are skipped with a warning.
- Existing contacts (matched by email) are **upserted** — fields are updated, not duplicated.
- Emails are stored lowercase.

---

## Template Personalization

Use `{{tag}}` syntax in subject and body fields. Tags are replaced at send time using contact data.

| Tag | Source field |
|-----|-------------|
| `{{email}}` | `contact.email` |
| `{{first_name}}` | `contact.firstName` |
| `{{last_name}}` | `contact.lastName` |
| `{{full_name}}` | `firstName + lastName` (falls back to email) |
| `{{company}}` | `contact.company` |
| `{{title}}` | `contact.title` |
| `{{phone}}` | `contact.phone` |
| `{{notes}}` | `contact.notes` |

Unknown tags are replaced with an empty string.

---

## Configuration

### SMTP providers

| Provider | Host | Port | Secure |
|----------|------|------|--------|
| Gmail | `smtp.gmail.com` | 587 | No (STARTTLS) |
| Gmail (SSL) | `smtp.gmail.com` | 465 | Yes |
| Outlook | `smtp.office365.com` | 587 | No |
| SendGrid | `smtp.sendgrid.net` | 587 | No |

Gmail requires an [App Password](https://myaccount.google.com/apppasswords) if 2FA is enabled.

### IMAP providers

| Provider | Host | Port |
|----------|------|------|
| Gmail | `imap.gmail.com` | 993 |
| Outlook | `outlook.office365.com` | 993 |

### Base URL

Set `baseUrl` to your **publicly accessible** application URL in production. Tracking pixels and click redirects use this value. If left as `http://localhost:3000`, tracking will not work for external recipients.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `file:./dev.db` | Prisma SQLite connection string |

SMTP and IMAP credentials are stored in the database (`Settings` table), not in environment variables. This allows runtime configuration via the UI.

---

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone <repo-url>
cd emailsend
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Generate Prisma client and build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open database GUI |

### Database migrations

After changing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name describe_your_change
```

---

## Production Deployment

### Checklist

1. **Database** — SQLite works for small deployments. For production scale, migrate to PostgreSQL by changing the Prisma datasource.
2. **Base URL** — Set to your public domain in Settings (e.g. `https://mailtrack.company.com`).
3. **SMTP** — Use a dedicated sending domain with SPF, DKIM, and DMARC configured.
4. **Process** — Deploy as a long-running Node.js process (VPS, Railway, Render, Docker). The scheduler requires the process to stay alive.
5. **HTTPS** — Required for reliable tracking; email clients may block mixed-content pixels.

### Docker (example)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma migrate deploy && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Migrating to PostgreSQL

1. Change `provider` in `prisma/schema.prisma` to `postgresql`.
2. Set `DATABASE_URL` to your Postgres connection string.
3. Run `npx prisma migrate dev`.

---

## Security Considerations

| Area | Current state | Recommendation |
|------|--------------|----------------|
| Authentication | **Google OAuth (Auth.js)** + `ALLOWED_EMAILS` allowlist | Keep allowlist updated; set `AUTH_*` secrets in Vercel |
| SMTP/IMAP passwords | Stored in Postgres plaintext | Encrypt at rest (Phase 2) or use secrets manager |
| API endpoints | Auth required except track/cron/auth | Add rate limits on send and import endpoints |
| Tracking endpoints | Public, no auth | Acceptable for pixels/redirects; consider signed URLs |
| Cron endpoints | Bearer `CRON_SECRET` | Rotate secret periodically |
| CSV upload | No file size limit | Add max file size validation |
| IMAP TLS | `rejectUnauthorized: false` | Use proper CA certificates in production |

**Sign-in:** Google only. Non-allowlisted accounts are rejected (`AccessDenied` → `/login`).

**Public routes:** `/api/auth/*`, `/api/track/*`, `/api/cron/*` (token), `/login`.

---

## Known Limitations

1. **Single settings profile** — one SMTP/IMAP account for the entire app (shared after login).
2. **Synchronous sending** — emails are sent sequentially in the request handler; large lists may timeout.
3. **Open tracking accuracy** — blocked by privacy features in modern email clients.
4. **No unsubscribe** — CAN-SPAM / GDPR compliance requires an unsubscribe mechanism for production outreach.
5. **Credentials at rest** — SMTP/IMAP passwords are not encrypted in the database yet.
6. **Scheduler on Vercel** — use external cron hitting `/api/cron/*` with `CRON_SECRET`.

---

## Future Improvements

- [x] User authentication (Google OAuth + allowlist)
- [ ] Encrypt SMTP/IMAP credentials at rest
- [ ] Background job queue for bulk sending (BullMQ / Inngest)
- [ ] Multi-user / per-user settings
- [ ] Unsubscribe link generation and suppression list
- [ ] Rich HTML email template editor
- [ ] Export campaign analytics to CSV
- [ ] Signed tracking URLs to prevent enumeration
- [ ] Rate limiting and send throttling
