# Work Tracker

A personal, single-user **project planner + focus-session tracker**, built as an installable **PWA**. Plan what you'll do for work and track progress toward your goals.

- **Projects → Milestones** — break each project into dated milestones (objectives). Completing milestones completes the project.
- **Dashboard** — the home overview: active projects, % complete (milestones left), the dates you planned to finish milestones by, and whether you're **ahead or behind schedule**.
- **Focus sessions** — pick the milestone you're working toward, list the tasks for that session, and run a countdown timer (pause/resume, extend, estimate-vs-actual). Each session is logged against its milestone + project.
- **Metrics** — what you're doing to hit your goals: total productive hours, a breakdown of **which milestones** you worked on in the period, time by project, streak, estimate accuracy, and a 14-day activity chart.
- **Pomodoro breaks** — finishing a session prompts a break; ad-hoc breaks too. Both are logged.
- **History** of every session/break, day by day (with its project + milestone; reassign from the entry editor).
- A **daily schedule** (under Settings) — mark which weekdays are work vs off, set a work-day and off-day template, and override individual dates. It shows what you *should* be doing now and nudges; it never starts/stops anything.

Dark, blue-themed, mobile-first (with iOS Dynamic Island safe-area handling). Built with Next.js (App Router, TypeScript, Tailwind).

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
