---
name: work-tracker
description: High-level architecture map of THIS app (the Work Tracker project/goal planner + focus-session PWA). Read this first when working anywhere in this repo — it explains the mental model, data model, timer math, storage driver, file layout, and conventions so you can act without exploring the codebase. Use for any change to projects, milestones, sessions, breaks, the schedule, history, dashboard/metrics, the timer, the store, the design system, or the PWA.
---

# Work Tracker — architecture overview

> **Keep this skill current.** This file is the source of truth for how the app works. Whenever you make a change that alters app behavior or anything described here — the data model, storage keys/driver, timer math, routes/API actions, the file map, the design system, or conventions — update the relevant section of this file **in the same change**, before you finish. Treat the doc edit as part of the task. Purely internal refactors that don't change documented behavior don't need an update.

Personal, **single-user** project/goal planner + focus-session tracker, shipped as an installable **PWA**. Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4, dark-only, **blue-themed**, mobile-first. No auth.

## Mental model (three layers)

1. **Planning — Projects → Milestones.** A **Project** is the top-level unit of work; you plan it as an ordered set of **Milestones** (a.k.a. objectives), each with a **`targetDate`** (the day you planned to finish it). A project is **done** when every milestone is done (or it's manually completed via `completedAt`). The **Dashboard** is the home of planning/overview; per-project milestone management lives on the **project detail** page. Progress (% milestones done) and **ahead/behind-schedule** status are *derived* (never stored) by `lib/projects.ts`.
2. **Actual tracking — the only thing that counts.** You run real **work sessions** and **breaks** (the timer). A work session is anchored to a **Milestone** (which implies its Project): the session's `taskName` = the milestone title, and `objectives[]` are the **tasks** you complete during that one session. Breaks are milestone-/project-less. Any time not covered by a logged work session is treated as break/idle. Pomodoro: ending a work session prompts a break.
3. **Conceptual schedule — a passive guide only.** Work/break **blocks** with clock times say "what you *should* be doing now"; it renders a timeline + "now" line and can nudge at transitions. It **never** starts/stops timers. It now lives **under Settings** (linked from `/settings`, page at `/schedule`), de-emphasized from the primary nav. Each day-of-week is a **work** or **off** day (`dayTypes`); two reusable templates (`templates.work`/`templates.off`); per-**date overrides** win for a single date. Still used by metrics to infer idle-break gaps inside scheduled work windows.

Don't conflate them: milestones ≠ sessions ≠ blocks. Milestones are the plan; sessions/breaks are logged reality; blocks are passive reference.

## Data & storage

`lib/store.ts` auto-selects a driver (singleton) — **no config needed locally**:
- **Upstash Redis** (`@upstash/redis`) when `UPSTASH_REDIS_REST_URL`+`_TOKEN` (or `KV_REST_API_URL`/`KV_REST_API_TOKEN`) are set. Required in production (Vercel fs is read-only). `isCloudStore()` reports which.
- **Local JSON file** fallback at `./.data/wt.json` (git-ignored): atomic temp-file rename + in-process mutex + defensive parse, missing key → typed defaults.

Six keys (`STORE_KEYS` in `lib/types.ts`): `wt:active`, `wt:logs`, `wt:projects`, `wt:milestones`, `wt:schedule`, `wt:settings`. The local file holds them as one `Doc` (`active`/`logs`/`projects`/`milestones`/`schedule`/`settings`).

**Types (`lib/types.ts`):**
- `Project{ id,name,createdAt,archived?,description?,startDate?:string|null,completedAt?:number|null }` (`startDate` = local `"YYYY-MM-DD"`, used to pace schedule status).
- `Milestone{ id,projectId,title,done,doneAt:number|null,targetDate:string|null("YYYY-MM-DD"),order,createdAt }`.
- `Objective{ id,text,done,createdAt }` — a **task** within a single session (UI calls them "tasks"; the type stays `Objective`).
- `Block{ id,type:'work'|'break',label,start,end }` (`start`/`end` = `"HH:MM"`).
- `ActiveSession`/`LogEntry` both carry `projectId:string|null` + denormalized `projectName`, **plus `milestoneId:string|null` + denormalized `milestoneName`** (`null`/`""` for breaks & unassigned), `taskName`, `objectives[]`.
- `Settings{ defaultWorkMin,defaultBreakMin,notificationsEnabled,soundEnabled }`, `DayType`, `Schedule{ dayTypes, templates:{work,off}, overrides }`, `Doc`.

Typed store accessors: `getActive/setActive`, `getLogs/setLogs/appendLog/updateLog/deleteLog`, `getProjects/setProjects/addProject`(idempotent on name)`/updateProject`(name/archived/description/startDate/completedAt)`/deleteProject`(cascades milestones), `getMilestones/setMilestones/addMilestone`(appends with next `order`)`/updateMilestone`(syncs `doneAt` on done-toggle)`/deleteMilestone`, `getSchedule/setSchedule`, `getSettings/setSettings`, `getAll/setAll`.

## Project/milestone logic (`lib/projects.ts`) — derive, never store

Pure helpers (no I/O); dates are local `"YYYY-MM-DD"` keys (consistent with `format.dayKey`):
- `progressOf(milestones)` → `{total,done,pct}`.
- `isProjectComplete(project,milestones)`; `projectMilestones(all,projectId)` (sorted by `order`→`targetDate`→`createdAt`); `nextOpenMilestone(milestones)`; `compareMilestones`.
- `scheduleStatus(project,milestones,now?)` → `{state:'ahead'|'on-track'|'behind'|'no-plan'|'done', daysDelta(signed), overdueCount, nextMilestone, label}`. Blends two signals: **overdue** open milestones (past `targetDate`) ⇒ behind; and **pace** (actual %-done vs expected %-done by elapsed time between `startDate`/first-milestone and the last `targetDate`) ⇒ the signed `daysDelta`. Badge tones: ahead→success, on-track→accent, behind→danger, no-plan→muted, done→success.
- `dayKeyToEpoch("YYYY-MM-DD")`, `daysBetween(aKey,bKey)`.

## Timer model (`lib/timer.ts`) — derive, never decrement

Time is **always recomputed from timestamps**, never a ticking counter (survives reloads/throttle, no drift).
- `activeMs = accumulatedActiveMs + (runningSince ? now - runningSince : 0)`; `budgetMs = estimateMs + extensionsMs`; `remainingMs = budgetMs - activeMs` (negative ⇒ "over", no auto-end).
- `pauseSession` folds the live segment into `accumulatedActiveMs`; `resumeSession` sets `runningSince=now`. `extendSession` grows `extensionsMs` (the target, not elapsed). Estimate accuracy is vs **original `estimateMs`**.
- `applyAway(session,'work'|'discard',now)` reconciles a reload while running using `lastSeenAt` (~25s heartbeat anchor). `finalizeToLog` freezes a session into a `LogEntry` (copies `projectId/projectName/milestoneId/milestoneName`). `touchSession` bumps `lastSeenAt`. Reload threshold: away < ~20s ⇒ resume silently.

## Routes & file map

**Pages (`app/`)** — all interactive ones are `"use client"`:
- `page.tsx` **Focus/Home** (the landing page): today's `Timeline` + `StartPanel` (no active) **or** `ActiveSession` (active). `StartPanel` flow = **pick the Milestone** you're working toward (grouped by project via `<optgroup>`; the project is *implied*, no separate project/main-objective step) → list **Tasks** for this session (`ObjectiveList`) → duration → start. Work start requires a milestone; breaks need none. Planning/creation happens on the Dashboard, not here. Shows `ReloadPrompt` on stale-running load, `BreakPrompt` after a work session ends.
- `dashboard/page.tsx` **Dashboard** (the main overview): fetches projects+milestones+logs; a summary strip (active count / due-this-week / overdue), a grid of `ProjectCard` for active projects (progress, next milestone+date, schedule-status badge, focus time → link to project detail), plus compact completed/archived lists, and an inline "+ New project".
- `projects/[id]/page.tsx` **Project detail**: reads id via `useParams()`; `ProjectEditor` (name/description/startDate, archive, complete/reopen, delete) + `MilestoneList`/`MilestoneRow` (add milestone, toggle done, inline-edit title, set `targetDate`, overdue styling, delete) + progress/schedule/focus-time. `projects/page.tsx` just redirects to `/dashboard`.
- `metrics/page.tsx` **Metrics**: range toggle (today/week/all); `MetricsCards` (productive hours, streak, sessions, tasks done, avg/median, estimate accuracy, peak hour, work/break); **time-by-milestone** + **time-by-project** via `MilestoneBreakdown`; 14-day `ActivityChart`.
- `history/page.tsx` + `history/[id]/page.tsx` day-grouped log; entries show project + milestone badges; edit/delete (`HistoryList`/`EntryEditor`).
- `settings/page.tsx` Pomodoro defaults, alert toggles + tests, backup export/import, **and a "Daily schedule" card linking to `/schedule`**.
- `schedule/page.tsx` two tabs (Weekly / Date overrides) using `ScheduleEditor`/`BlockRow` + live `Timeline`; back-link to Settings. (Not in the primary nav.)

**API route handlers (`app/api/`)** — `force-dynamic`, the only server logic:
- `active/route.ts`: `GET`/`POST`(start)/`DELETE`(cancel)/`PATCH` with `action` ∈ `pause|resume|extend|heartbeat|setObjectives|applyAway|startBreak|end`. On `POST`, resolves project from `projectId` **and** milestone from `milestoneId` (must belong to the project), snapshotting both names onto the session so `finalizeToLog` just copies them.
- `logs/route.ts` `GET`; `logs/[id]/route.ts` `PATCH`(can reassign `projectId` **and `milestoneId`**, re-snapshots names)/`DELETE`.
- `projects/route.ts` `GET`/`POST`(create-by-name); `projects/[id]/route.ts` `PATCH`/`DELETE`(cascade).
- `milestones/route.ts` `GET`(optional `?projectId=`)/`POST`(create); `milestones/[id]/route.ts` `PATCH`/`DELETE`.
- `schedule/route.ts` `GET`/`PUT`; `settings/route.ts` `GET`/`PUT`; `backup/route.ts` `GET` export / `POST` import (normalizes projects/milestones/logs incl. the new fields).
- Next 16: dynamic `params` is async — `await params`.

**lib/:** `api.ts` (typed browser fetch wrappers — incl. `getMilestones/createMilestone/updateMilestone/deleteMilestone`, `updateProject/deleteProject`; `startSession` takes `projectId`+`milestoneId`), `useActiveSession.ts` (client hook: fetch + 1s tick + ~25s heartbeat + actions; `StartWorkInput` carries `milestoneId`), `projects.ts` (progress + ahead/behind, above), `schedule.ts` (`effectiveBlocks`, `dayTypeForDate`, …; normalization/migration lives in `store.ts`), `metrics.ts` (pure aggregations; **cancelled excluded** via `countedLogs`; `inferredBreakMsForDay`; `timeByProject`; **`timeByMilestone(logs,milestoneNameById,projectNameById,range,now)`**), `format.ts`, `notify.ts`, `sound.ts`.

**Design system:** `app/globals.css` — dark, **blue-themed** (sky/azure `--accent: #0ea5e9`, blue-tinted slate neutrals, gradients, soft shadows, ambient top glow). Tokens exposed as Tailwind utilities (`bg`, `bg-2`, `surface`, `surface-2`, `surface-3`, `border`, `border-strong`, `text`, `muted`, `faint`, `accent`, `accent-hover`, `accent-strong`, `accent-2`, `accent-contrast`, `accent-soft`, `success`, `warning`, `danger`) + utility classes `.card`/`.card-hover`/`.btn-primary`(gradient CTA)/`.btn-secondary`/`.eyebrow`. **Shared primitives in `components/ui/`**: `Card`, `Badge`(tones), `ProgressBar`, `PageHeader`, `EmptyState`, `cn`. Reuse these for any new UI.

**PWA:** `public/manifest.webmanifest` + `public/sw.js` (registered by `components/SWRegister.tsx`). `app/layout.tsx` offsets the desktop sidebar, the mobile bottom tab bar, **and the iOS top safe area (`env(safe-area-inset-top)`) on mobile** for the Dynamic Island; `viewportFit:"cover"`, `themeColor:"#070b14"`. Content sits in a `relative z-10` wrapper above the ambient glow.

## Conventions & gotchas

- **Client state = plain `fetch` (via `lib/api`) + React state, no SWR.** Never import `lib/store` on the client. Timer ticks locally from timestamps; only semantic actions + heartbeat write to the store.
- Objectives/milestones mutate **by `id`**, never index.
- **Never block session start** on notification permission / audio unlock — fire-and-forget in the click gesture (`StartPanel.primeGesture`). `unlock()` + `Notification.requestPermission()` must originate from a user gesture but must not be awaited.
- Metrics/day-grouping bucket by **local** day; live-time rendering stays client-side (avoid hydration mismatch). `targetDate`/`startDate`/day keys compare lexicographically as `"YYYY-MM-DD"`.
- Next 16: Turbopack is default — **don't add a `webpack` key**. There are advisory "serializable props"/`*Action` and `FormEvent`-deprecation lint warnings on client function props — **non-blocking, build is green; don't churn the codebase renaming callbacks**.
- **Cancel keeps a `status:'cancelled'` log** (shown in History, excluded from metrics) — it is *not* discarded.
- New UI should use the `components/ui/` primitives + design tokens (no raw hex), `PageHeader` at the top of pages, and must not add its own top safe-area padding (the layout handles it).

## Run / deploy

`npm run dev` → http://localhost:3000 (file store, zero setup). `npm run build` for prod (TS-checked; green). Deploy: push to GitHub → import in Vercel → add the **Upstash Redis** Marketplace integration (required) → Add to Home Screen on phone. Env in `.env.example`. (Optional `APP_PASSCODE` gate is **not implemented**.)
