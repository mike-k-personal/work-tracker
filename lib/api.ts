// lib/api.ts
// Typed CLIENT fetch wrappers for every API route. These run in the BROWSER
// (feature components import them). The server-only store (lib/store.ts) must
// never be imported from the client — go through these instead.
//
// Every wrapper throws an ApiError on a non-2xx response (with the server's
// { error } message when present) so callers can try/catch.

import type {
  ActiveSession,
  Block,
  DayType,
  Doc,
  EndReason,
  LogEntry,
  Milestone,
  Objective,
  Project,
  Schedule,
  Settings,
} from "@/lib/types";
import type { AwayChoice } from "@/lib/timer";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    // Always hit the network; never serve a cached API response.
    cache: "no-store",
    headers:
      init?.body !== undefined
        ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
        : init?.headers,
    ...init,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ----------------------------------------------------------------------------
// Active session
// ----------------------------------------------------------------------------

export type StartSessionInput = {
  kind: "work" | "break";
  projectId?: string | null;
  milestoneId?: string | null;
  taskName: string;
  objectives?: Objective[];
  estimateMs: number;
};

/** GET /api/active */
export async function getActive(): Promise<ActiveSession | null> {
  const { active } = await request<{ active: ActiveSession | null }>(
    "/api/active",
  );
  return active;
}

/** POST /api/active — start a new work/break session. */
export async function startSession(
  input: StartSessionInput,
): Promise<ActiveSession> {
  const { active } = await request<{ active: ActiveSession }>("/api/active", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return active;
}

async function patchActive(
  body: Record<string, unknown>,
): Promise<{ active: ActiveSession | null; log?: LogEntry }> {
  return request<{ active: ActiveSession | null; log?: LogEntry }>(
    "/api/active",
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

/** PATCH /api/active { action: 'pause' } */
export async function pauseSession(): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "pause" });
  return active;
}

/** PATCH /api/active { action: 'resume' } */
export async function resumeSession(): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "resume" });
  return active;
}

/** PATCH /api/active { action: 'extend', addMs } */
export async function extendSession(
  addMs: number,
): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "extend", addMs });
  return active;
}

/** PATCH /api/active { action: 'heartbeat' } */
export async function heartbeat(): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "heartbeat" });
  return active;
}

/** PATCH /api/active { action: 'setObjectives', objectives } */
export async function setObjectives(
  objectives: Objective[],
): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "setObjectives", objectives });
  return active;
}

/** PATCH /api/active { action: 'applyAway', choice } — reconcile away time. */
export async function applyAway(
  choice: AwayChoice,
): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "applyAway", choice });
  return active;
}

/**
 * PATCH /api/active { action: 'startBreak', estimateMs?, taskName? }
 * Replaces the active session with a fresh break (used by the Pomodoro flow
 * after a work session ends, and by the ad-hoc break button).
 */
export async function startBreak(
  opts: { estimateMs?: number; taskName?: string } = {},
): Promise<ActiveSession | null> {
  const { active } = await patchActive({ action: "startBreak", ...opts });
  return active;
}

/**
 * PATCH /api/active { action: 'end', endReason } — finalize to a COMPLETED log,
 * clear active, and RETURN the created log so the client can show the break
 * prompt.
 */
export async function endSession(
  endReason: EndReason = "manual",
): Promise<LogEntry | null> {
  const { log } = await patchActive({ action: "end", endReason });
  return log ?? null;
}

/** DELETE /api/active — cancel: finalize to a CANCELLED log, clear active. */
export async function cancelSession(): Promise<LogEntry | null> {
  const { log } = await request<{ active: null; log: LogEntry | null }>(
    "/api/active",
    { method: "DELETE" },
  );
  return log ?? null;
}

// ----------------------------------------------------------------------------
// Projects
// ----------------------------------------------------------------------------

/** GET /api/projects */
export async function getProjects(): Promise<Project[]> {
  const { projects } = await request<{ projects: Project[] }>("/api/projects");
  return projects;
}

/** POST /api/projects — create (or return the existing) project by name. */
export async function createProject(name: string): Promise<Project> {
  const { project } = await request<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return project;
}

/** PATCH /api/projects/[id] — edit name/archived/description/startDate/completedAt. */
export async function updateProject(
  id: string,
  patch: Partial<
    Pick<
      Project,
      "name" | "archived" | "description" | "startDate" | "completedAt"
    >
  >,
): Promise<Project> {
  const { project } = await request<{ project: Project }>(
    `/api/projects/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return project;
}

/** DELETE /api/projects/[id] — delete project + cascade its milestones. */
export async function deleteProject(id: string): Promise<boolean> {
  const { ok } = await request<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return ok;
}

// ----------------------------------------------------------------------------
// Milestones
// ----------------------------------------------------------------------------

/** GET /api/milestones (optionally ?projectId=…). */
export async function getMilestones(projectId?: string): Promise<Milestone[]> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const { milestones } = await request<{ milestones: Milestone[] }>(
    `/api/milestones${qs}`,
  );
  return milestones;
}

/** POST /api/milestones — create a milestone in a project. */
export async function createMilestone(input: {
  projectId: string;
  title: string;
  targetDate?: string | null;
}): Promise<Milestone> {
  const { milestone } = await request<{ milestone: Milestone }>(
    "/api/milestones",
    { method: "POST", body: JSON.stringify(input) },
  );
  return milestone;
}

/** PATCH /api/milestones/[id] — edit title/targetDate/done/order. */
export async function updateMilestone(
  id: string,
  patch: Partial<Pick<Milestone, "title" | "targetDate" | "done" | "order">>,
): Promise<Milestone> {
  const { milestone } = await request<{ milestone: Milestone }>(
    `/api/milestones/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return milestone;
}

/** DELETE /api/milestones/[id]. */
export async function deleteMilestone(id: string): Promise<boolean> {
  const { ok } = await request<{ ok: boolean }>(
    `/api/milestones/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return ok;
}

// ----------------------------------------------------------------------------
// Logs / history
// ----------------------------------------------------------------------------

/** GET /api/logs */
export async function getLogs(): Promise<LogEntry[]> {
  const { logs } = await request<{ logs: LogEntry[] }>("/api/logs");
  return logs;
}

/** PATCH /api/logs/[id] — edit allowed fields. */
export async function updateLog(
  id: string,
  patch: Partial<LogEntry>,
): Promise<LogEntry> {
  const { log } = await request<{ log: LogEntry }>(
    `/api/logs/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return log;
}

/** DELETE /api/logs/[id] */
export async function deleteLog(id: string): Promise<boolean> {
  const { ok } = await request<{ ok: boolean }>(
    `/api/logs/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return ok;
}

// ----------------------------------------------------------------------------
// Schedule
// ----------------------------------------------------------------------------

/** GET /api/schedule */
export async function getSchedule(): Promise<Schedule> {
  const { schedule } = await request<{ schedule: Schedule }>("/api/schedule");
  return schedule;
}

/**
 * PUT /api/schedule — replace any of: dayTypes (work/off per weekday), the work
 * and/or off block templates, and per-date overrides. Templates merge per-side.
 */
export async function putSchedule(
  patch: {
    dayTypes?: Record<number, DayType>;
    templates?: { work?: Block[]; off?: Block[] };
    overrides?: Record<string, Block[]>;
  },
): Promise<Schedule> {
  const { schedule } = await request<{ schedule: Schedule }>("/api/schedule", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return schedule;
}

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------

/** GET /api/settings */
export async function getSettings(): Promise<Settings> {
  const { settings } = await request<{ settings: Settings }>("/api/settings");
  return settings;
}

/** PUT /api/settings — merge the provided fields. */
export async function putSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const { settings } = await request<{ settings: Settings }>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return settings;
}

// ----------------------------------------------------------------------------
// Backup
// ----------------------------------------------------------------------------

/**
 * GET /api/backup — triggers a JSON file download in the browser.
 * (Navigates via a temporary anchor so the Content-Disposition is honored.)
 */
export function exportData(): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = "/api/backup";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** GET /api/backup but returns the parsed Doc (for in-app handling). */
export async function fetchBackup(): Promise<Doc> {
  return request<Doc>("/api/backup");
}

/** POST /api/backup — import a Doc-shaped object (overwrites all data). */
export async function importData(doc: unknown): Promise<Doc> {
  const { doc: saved } = await request<{ ok: boolean; doc: Doc }>(
    "/api/backup",
    { method: "POST", body: JSON.stringify(doc) },
  );
  return saved;
}
