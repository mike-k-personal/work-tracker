// lib/types.ts
// Shared data-model contract for Work Tracker. Single-owner file: every other
// module imports these types. Mirrors exactly the model in the approved plan.

/** A block on the conceptual schedule timeline. start/end are local "HH:MM". */
export type BlockType = "work" | "break";

export type Block = {
  id: string;
  type: BlockType;
  label: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

/** A single checklist item attached to a work session. */
export type Objective = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number; // epoch ms
};

/**
 * A project: the top-level unit of work. A project is planned out as an ordered
 * set of milestones (objectives) and is "done" once every milestone is done.
 * Work sessions reference a project by id; logs also snapshot the name so
 * history survives a rename/removal.
 */
export type Project = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  archived?: boolean; // hidden from the picker, kept for historical metrics
  description?: string; // optional short blurb shown on the project
  /** Planned start day, local "YYYY-MM-DD"; used to pace ahead/behind schedule. */
  startDate?: string | null;
  /** Manual completion: when set, the project is done regardless of milestones. */
  completedAt?: number | null;
};

/**
 * A milestone (a.k.a. objective): a planned, dated checkpoint inside a project.
 * Completing the tasks in work sessions moves a milestone toward `done`, and
 * completing every milestone completes the project. `targetDate` is the day you
 * planned to finish it by and drives the ahead/behind-schedule indicator.
 */
export type Milestone = {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  doneAt: number | null; // epoch ms when marked done; null while open
  /** Planned completion day, local "YYYY-MM-DD"; null when undated. */
  targetDate: string | null;
  order: number; // manual ordering within the project
  createdAt: number; // epoch ms
};

export type SessionKind = "work" | "break";

export type SessionStatus = "running" | "paused";

/**
 * The in-progress work OR break session. Timing is derived from immutable
 * timestamps (never a decrementing counter).
 */
export type ActiveSession = {
  id: string;
  kind: SessionKind;
  projectId: string | null; // work only; null for breaks / unassigned
  projectName: string; // denormalized snapshot; "" for breaks / unassigned
  milestoneId: string | null; // milestone this session moves forward; null when none
  milestoneName: string; // denormalized snapshot; "" when none
  taskName: string; // the session's "main objective" free-text name ("Break" for breaks)
  objectives: Objective[]; // tasks completed this session, work only (empty for breaks)
  status: SessionStatus;
  startedAt: number; // wall-clock start (epoch ms)
  accumulatedActiveMs: number; // frozen active ms from finished segments
  runningSince: number | null; // epoch ms of current running segment; null when paused
  estimateMs: number; // ORIGINAL target (never mutated)
  extensionsMs: number; // sum of +5/+10/custom extensions
  lastSeenAt: number; // heartbeat anchor for reload away-time
};

export type LogStatus = "completed" | "cancelled";

export type EndReason =
  | "all-done"
  | "manual"
  | "cancelled"
  | "timer-expired";

/** A completed/cancelled session stored in history; source for all metrics. */
export type LogEntry = {
  id: string;
  kind: SessionKind;
  projectId: string | null; // work only; null for breaks / unassigned
  projectName: string; // denormalized snapshot for display & per-project metrics
  milestoneId: string | null; // milestone worked on; null when none
  milestoneName: string; // denormalized snapshot for display & per-milestone metrics
  taskName: string; // the session's "main objective" free-text name
  objectives: Objective[];
  status: LogStatus;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  activeMs: number; // FINAL active time, paused time excluded
  estimateMs: number; // ORIGINAL target
  extensionsMs: number;
  objectivesTotal: number; // denormalized for cheap metrics
  objectivesCompleted: number; // denormalized for cheap metrics
  endReason: EndReason;
};

/** App-wide settings. */
export type Settings = {
  defaultWorkMin: number;
  defaultBreakMin: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
};

/** Whether a given day-of-week follows the work-day or off-day template. */
export type DayType = "work" | "off";

/**
 * The conceptual schedule.
 *
 * - `dayTypes` classifies each day-of-week (0=Sun..6=Sat) as a work or off day.
 * - `templates` holds the two reusable block lists: one for work days, one for
 *   off days. A day inherits the template matching its `dayTypes` classification.
 * - `overrides` is keyed by local "YYYY-MM-DD" and wins over the template for
 *   that single date.
 */
export type Schedule = {
  dayTypes: Record<number, DayType>;
  templates: {
    work: Block[];
    off: Block[];
  };
  overrides: Record<string, Block[]>;
};

/** The complete document, used for backup export/import. */
export type Doc = {
  active: ActiveSession | null;
  logs: LogEntry[];
  projects: Project[];
  milestones: Milestone[];
  schedule: Schedule;
  settings: Settings;
};

/** Alias for the full persisted state. */
export type StoreState = Doc;

/** Redis/file keys used by the store. */
export const STORE_KEYS = {
  active: "wt:active",
  logs: "wt:logs",
  projects: "wt:projects",
  milestones: "wt:milestones",
  schedule: "wt:schedule",
  settings: "wt:settings",
} as const;

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS];
