# Work Tracker

A personal, single-user **day-planner + focus/Pomodoro tracker**, built as an installable **PWA**.

- A **conceptual schedule** — mark which weekdays are work vs off, set one schedule for work days and one for off days, then override individual dates as needed. It shows what you *should* be doing now and nudges; it never starts/stops anything.
- **Projects** — pick (or add) a project, then a main objective and sub-objectives, and start. Every work session is tagged to a project so you can see time per project.
- **Work sessions** with a countdown timer, editable sub-objectives, pause/resume, extend, and an estimate-vs-actual record.
- **Pomodoro breaks** — finishing a session prompts a break; ad-hoc breaks too. Both are logged.
- **History** of every session/break, day by day (reassign a session's project from the entry editor).
- A **dashboard** of productivity metrics (focus time, time-by-project, streak, estimate accuracy, activity chart, etc.).

Dark, minimal, mobile-first. Built with Next.js (App Router, TypeScript, Tailwind).

## Data storage

The data layer auto-selects a driver at runtime:

- **Local dev:** if no Redis env vars are set, it writes to a local JSON file at `./.data/wt.json` (git-ignored). **Zero setup — just run it.**
- **Production (Vercel):** if Upstash Redis env vars are set, it uses Upstash. This is **required when deployed**, because Vercel's serverless filesystem is read-only/ephemeral — the file fallback won't persist there. Using Upstash also means **your phone and laptop share the same data**.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. No database or env vars needed — it uses the local file store.

## Deploy to Vercel + install on your phone

1. **Push to a public GitHub repo** (`git init` is already done; just commit and push).
2. **Import the repo in Vercel** → [vercel.com/new](https://vercel.com/new) → select the repo → Deploy.
3. **Add Upstash Redis** (free, required for the live app to save data): in the Vercel project → **Storage** → **Marketplace** → **Upstash Redis** → create a database and connect it to the project. This auto-injects the env vars below. Redeploy if prompted.
4. **Install on your phone:** open the deployed URL in your phone's browser → **Add to Home Screen**. Open it from the home-screen icon and **allow notifications** when asked.

### Environment variables

The Upstash/Vercel integration sets these for you. The app accepts either naming:

```
UPSTASH_REDIS_REST_URL    (or KV_REST_API_URL)
UPSTASH_REDIS_REST_TOKEN  (or KV_REST_API_TOKEN)
```

To point local dev at Upstash too (optional), copy `.env.example` to `.env.local` and fill these in.

## Notifications — what to expect

There is no backend push server, so notifications (timer-done, break-over, schedule block transitions) fire **only while the app is open or running in the background**. They will **not** fire when the app is fully closed. On iPhone, web notifications require the app to be **installed to the Home Screen** (iOS 16.4+). Use the **Test notification** / **Test chime** buttons in Settings to confirm alerts work on your device.

## Backup

Settings → **Export JSON** downloads all your data; **Import JSON** restores it. Useful for backups or moving data between devices if you ever run without Upstash.
