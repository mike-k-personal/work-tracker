---
name: work-tracker
description: High-level architecture map of THIS app (the Work Tracker day-planner + Pomodoro PWA). Read this first when working anywhere in this repo — it explains the mental model, data model, timer math, storage driver, file layout, and conventions so you can act without exploring the codebase. Use for any change to sessions, breaks, the schedule, history, dashboard/metrics, the timer, the store, or the PWA.
---

# Work Tracker — architecture overview

> **Keep this skill current.** This file is the source of truth for how the app works. Whenever you make a change that alters app behavior or anything described here — the data model, storage keys/driver, timer math, routes/API actions, the file map, conventions, or run/deploy steps — update the relevant section of this file **in the same change**, before you finish. Treat the doc edit as part of the task, not a follow-up. If a change makes a statement here wrong, fix the statement. Purely internal refactors that don't change any documented behavior don't need an update.

Personal, **single-user** day-planner + focus/Pomodoro tracker, shipped as an installable **PWA**. Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4, dark-only, mobile-first. No auth.

## Mental model (two layers)

1. **Conceptual schedule — a guide only.** Work/break **blocks** with clock times tell you "what you *should* be doing now." It renders a timeline + a "now" line and can nudge at block transitions. It **never** starts/stops timers or enforces anything. Each day-of-week is classified as a **work** or **off** day (`dayTypes`); there are exactly **two reusable templates** (`templates.work` / `templates.off`) and a day inherits the template matching its type. Per-**date overrides** win over the template for a single date.
2. **Actual tracking — the only thing that counts.** You run real **work sessions** and **breaks** (the timer). Each work session is tagged to a **Project** (the top-level grouping for time-per-project metrics); its `taskName` is the free-text "main objective" and `objectives[]` are the sub-objectives (typed fresh per session). Breaks are project-less. Any time not covered by a logged work session is treated as break/idle. Pomodoro: ending a work session prompts a break.

Don't conflate them: blocks ≠ sessions. Blocks are passive reference; sessions/breaks are the logged reality.

## Data & storage

`lib/store.ts` auto-selects a driver (singleton) — **no config needed locally**:
- **Upstash Redis** (`@upstash/redis`) when `UPSTASH_REDIS_REST_URL`+`_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) are set. Required in production (Vercel fs is read-only). `isCloudStore()` reports which.
- **Local JSON file** fallback at `./.data/wt.json` (git-ignored): atomic temp-file rename + in-process mutex + defensive parse, missing key → typed defaults.

Five keys (`STORE_KEYS` in `lib/types.ts`): `wt:active`, `wt:logs`, `wt:projects`, `wt:schedule`, `wt:settings`. The local file holds them as one `Doc` object (`active`/`logs`/`projects`/`schedule`/`settings`).

**Types (`lib/types.ts`):** `Block{ id,type:'work'|'break',label,start,end }` (`start`/`end` = `"HH:MM"`), `Objective{ id,text,done,createdAt }`, `Project{ id,name,createdAt,archived? }`, `ActiveSession`/`LogEntry` (both carry `projectId:string|null` + denormalized `projectName:string` — `null`/`""` for breaks & unassigned), `Settings{ defaultWorkMin,defaultBreakMin,notificationsEnabled,soundEnabled }`, `DayType='work'|'off'`, `Schedule{ dayTypes:Record<0..6,DayType>, templates:{work:Block[],off:Block[]}, overrides:Record<"YYYY-MM-DD",Block[]> }`, `Doc`.

Typed store accessors: `getActive/setActive`, `getLogs/setLogs/appendLog/updateLog/deleteLog`, `getProjects/setProjects/addProject`(idempotent on name)`/updateProject`, `getSchedule/setSchedule`, `getSettings/setSettings`, `getAll/setAll`.

## Timer model (`lib/timer.ts`) — derive, never decrement

Time is **always recomputed from timestamps**, never stored as a ticking counter (survives reloads/background-throttle with no drift).
- `activeMs = accumulatedActiveMs + (runningSince ? now - runningSince : 0)`; `budgetMs = estimateMs + extensionsMs`; `remainingMs = budgetMs - activeMs` (negative ⇒ "over", no auto-end).
- `pauseSession` folds the live segment into `accumulatedActiveMs`, nulls `runningSince` (paused time excluded). `resumeSession` sets `runningSince=now`.
- `extendSession` grows `extensionsMs` only (the target, not elapsed). **Estimate accuracy is vs original `estimateMs`, not budget.**
- `applyAway(session, 'work'|'discard', now)` reconciles a reload while running, using `lastSeenAt` (the ~25s heartbeat anchor). `finalizeToLog` freezes a session into a `LogEntry`.
- `touchSession` bumps `lastSeenAt`. Reload prompt threshold: away < ~20s ⇒ resume silently.

## Routes & file map

**Pages (`app/`)** — all interactive ones are `"use client"`:
- `page.tsx` Home: today's `Timeline` + `StartPanel` (no active) **or** `ActiveSession` (active). `StartPanel` flow = pick/add **Project** → **Main objective** (taskName) → **Sub-objectives** → duration → start (work start is blocked until a project is chosen; breaks need none). Home fetches projects + owns `onCreateProject`. Shows `ReloadPrompt` on stale-running load, `BreakPrompt` after a work session ends.
- `schedule/page.tsx` two tabs: **Weekly** (toggle each weekday work/off + edit the work-day and off-day templates) and **Date overrides** (per-date custom day); both use `ScheduleEditor`/`BlockRow` with a live `Timeline` preview.
- `history/page.tsx` + `history/[id]/page.tsx` day-grouped log, detail, edit/delete (`HistoryList`/`EntryEditor`).
- `dashboard/page.tsx` metrics cards + **Time-by-project** breakdown + 14-day chart (`MetricsCards`/`ActivityChart`).
- `settings/page.tsx` Pomodoro defaults, alert toggles, test buttons, backup export/import.

**API route handlers (`app/api/`)** — `force-dynamic`, the only server logic:
- `active/route.ts`: `GET` read · `POST` start · `DELETE` cancel · `PATCH` with `action` ∈ `pause|resume|extend|heartbeat|setObjectives|applyAway|startBreak|end` (`end` returns the created `LogEntry` so the client can show the break prompt).
- `logs/route.ts` `GET`; `logs/[id]/route.ts` `PATCH`(can reassign `projectId`, re-snapshots `projectName`)/`DELETE` (Next 16: `params` is async — `await params`).
- `projects/route.ts` `GET` list / `POST` create-by-name.
- `schedule/route.ts` `GET`/`PUT`; `settings/route.ts` `GET`/`PUT`; `backup/route.ts` `GET` export / `POST` import.
- On `POST /api/active` the server resolves the project name from `projectId` and snapshots both onto the session (so `finalizeToLog` just copies them — `lib/timer` stays project-agnostic).

**lib/:** `api.ts` (typed browser fetch wrappers — `startSession`(takes `projectId`), `pauseSession`, `extendSession`, `endSession`, `applyAway`, `startBreak`, `getProjects`, `createProject`, `putSchedule`, …), `useActiveSession.ts` (client hook: fetch + 1s tick + ~25s heartbeat + action callbacks), `schedule.ts` (pure resolution: `effectiveBlocks` [override → day-type template], `dayTypeForDate`, `defaultDayTypes`, `currentBlock`, `nextTransition`, `dayKeyForDate`; schedule **normalization + legacy `weekly`→`dayTypes`/`templates` migration lives in `store.ts`'s `normalizeSchedule`, run on every `getSchedule`**), `metrics.ts` (pure aggregations; **cancelled excluded** via `countedLogs`; `inferredBreakMsForDay` adds gap time; `timeByProject(logs, nameById, range)` groups focus by project — resolves the *current* name from `nameById`, falls back to the log's `projectName` snapshot, then "No project"), `format.ts`, `notify.ts`, `sound.ts` (Web Audio chime).

**PWA:** `public/manifest.webmanifest` + `public/sw.js` (registered by `components/SWRegister.tsx`). Hand-rolled, no build plugin.

## Conventions & gotchas

- **Client state = plain `fetch` + React state, no SWR.** Timer ticks locally from timestamps; only semantic actions + heartbeat write to the store.
- Objectives mutate **by `id`**, never index.
- **Never block session start** on notification permission / audio unlock — fire-and-forget in the click gesture (`StartPanel.primeGesture`). Audio `unlock()` and `Notification.requestPermission()` must originate from a user gesture but must not be awaited.
- Notifications fire **only while the app is open/active** (no push backend); iOS needs Home-Screen install.
- Metrics/day-grouping bucket by **local** day; live-time rendering stays client-side (avoid hydration mismatches).
- Next 16: Turbopack is default — **don't add a `webpack` key** to `next.config.ts`. There are advisory "serializable props"/`*Action` lint warnings on client function props — non-blocking, build is green; don't churn the codebase renaming callbacks.
- **Cancel keeps a `status:'cancelled'` log** (shown in History, excluded from metrics) — it is *not* discarded.

## Run / deploy

`npm run dev` → http://localhost:3000 (works with the file store, zero setup). `npm run build` for prod. Deploy: push to GitHub → import in Vercel → add the **Upstash Redis** Marketplace integration (required) → Add to Home Screen on phone. Full steps in `README.md`; env in `.env.example`. (Optional `APP_PASSCODE` gate from the original plan is **not implemented**.)
