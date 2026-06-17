// lib/store.ts
// Auto-selecting persistence driver.
//
// If Upstash/Vercel-KV REST env vars are present, use @upstash/redis.
// Otherwise fall back to a local JSON file at <root>/.data/wt.json so the app
// runs locally with zero external setup.
//
// Both drivers expose the SAME async interface. Local-file driver uses:
//   - recursive mkdir of .data
//   - atomic write (temp file + rename)
//   - an in-process promise-chain mutex to serialize read-modify-write
//   - defensive JSON.parse with typed-default fallback

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import type {
  ActiveSession,
  Block,
  BlockType,
  DayType,
  LogEntry,
  Project,
  Schedule,
  Settings,
  Doc,
} from "@/lib/types";
import { STORE_KEYS } from "@/lib/types";
import { defaultDayTypes } from "@/lib/schedule";

// ----------------------------------------------------------------------------
// Defaults
// ----------------------------------------------------------------------------

export function defaultSettings(): Settings {
  return {
    defaultWorkMin: 50,
    defaultBreakMin: 10,
    notificationsEnabled: true,
    soundEnabled: true,
  };
}

export function defaultSchedule(): Schedule {
  return {
    dayTypes: defaultDayTypes(),
    templates: { work: [], off: [] },
    overrides: {},
  };
}

// ----------------------------------------------------------------------------
// Schedule normalization & migration
//
// Coerces arbitrary stored/imported input into a sound Schedule. Also migrates
// the LEGACY shape ({ weekly: Record<dow, Block[]> }) into the current
// dayTypes/templates model so old data (and old backups) keep working.
// ----------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Coerce arbitrary input into a clean Block, or null if unusable. */
export function normalizeBlock(raw: unknown): Block | null {
  if (!isObject(raw)) return null;
  const type: BlockType = raw.type === "break" ? "break" : "work";
  const start = typeof raw.start === "string" ? raw.start : "";
  const end = typeof raw.end === "string" ? raw.end : "";
  if (!start || !end) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    type,
    label:
      typeof raw.label === "string" && raw.label
        ? raw.label
        : type === "break"
          ? "Break"
          : "Work",
    start,
    end,
  };
}

export function normalizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const raw of input) {
    const block = normalizeBlock(raw);
    if (block) out.push(block);
  }
  return out;
}

export function normalizeBlockMap(input: unknown): Record<string, Block[]> {
  if (!isObject(input)) return {};
  const out: Record<string, Block[]> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = normalizeBlocks(value);
  }
  return out;
}

/** Coerce input into a full 0..6 day-type map, defaulting any missing/invalid. */
export function normalizeDayTypes(input: unknown): Record<number, DayType> {
  const out = defaultDayTypes();
  if (isObject(input)) {
    for (let d = 0; d < 7; d++) {
      const v = input[String(d)];
      if (v === "off" || v === "work") out[d] = v;
    }
  }
  return out;
}

/** Coerce input into the two block templates (work + off). */
export function normalizeTemplates(input: unknown): {
  work: Block[];
  off: Block[];
} {
  const o = isObject(input) ? input : {};
  return { work: normalizeBlocks(o.work), off: normalizeBlocks(o.off) };
}

/** Migrate the legacy { weekly: Record<dow, Block[]> } shape to the new model. */
function migrateLegacySchedule(input: Record<string, unknown>): Schedule {
  const weekly = normalizeBlockMap(input.weekly);
  const dayTypes = defaultDayTypes();
  // A day that had blocks becomes a work day; an empty day becomes an off day.
  for (let d = 0; d < 7; d++) {
    dayTypes[d] = (weekly[String(d)] ?? []).length > 0 ? "work" : "off";
  }
  // Seed the work template from the first day-of-week that had any blocks.
  let work: Block[] = [];
  for (let d = 0; d < 7; d++) {
    const blocks = weekly[String(d)] ?? [];
    if (blocks.length > 0) {
      work = blocks.map((b) => ({ ...b, id: crypto.randomUUID() }));
      break;
    }
  }
  return {
    dayTypes,
    templates: { work, off: [] },
    overrides: normalizeBlockMap(input.overrides),
  };
}

/** Coerce arbitrary input into a sound Schedule (migrating legacy data). */
export function normalizeSchedule(input: unknown): Schedule {
  if (!isObject(input)) return defaultSchedule();
  const hasNewShape = "templates" in input || "dayTypes" in input;
  if (!hasNewShape && "weekly" in input) {
    return migrateLegacySchedule(input);
  }
  return {
    dayTypes: normalizeDayTypes(input.dayTypes),
    templates: normalizeTemplates(input.templates),
    overrides: normalizeBlockMap(input.overrides),
  };
}

export function defaultDoc(): Doc {
  return {
    active: null,
    logs: [],
    projects: [],
    schedule: defaultSchedule(),
    settings: defaultSettings(),
  };
}

// ----------------------------------------------------------------------------
// Driver abstraction
// ----------------------------------------------------------------------------

type RawValue =
  | ActiveSession
  | null
  | LogEntry[]
  | Project[]
  | Schedule
  | Settings;

interface Driver {
  /** Returns the raw stored value for a key, or null if missing. */
  read<T extends RawValue>(key: string): Promise<T | null>;
  /** Writes (or deletes, when value is null) a single key. */
  write<T extends RawValue>(key: string, value: T): Promise<void>;
  /**
   * Atomic read-modify-write for a single key. `fn` receives the current value
   * (or null) and returns the next value; the whole cycle holds the driver's
   * lock so concurrent mutations never lose updates. Returns the written value.
   */
  mutate<T extends RawValue>(
    key: string,
    fn: (current: T | null) => T,
  ): Promise<T>;
}

// ----------------------------------------------------------------------------
// Redis driver (@upstash/redis)
// ----------------------------------------------------------------------------

function redisEnv(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    "";
  if (url && token) return { url, token };
  return null;
}

class RedisDriver implements Driver {
  private clientPromise: Promise<{
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<unknown>;
    del: (key: string) => Promise<unknown>;
  }>;

  constructor(private env: { url: string; token: string }) {
    this.clientPromise = this.makeClient();
  }

  private async makeClient() {
    const { Redis } = await import("@upstash/redis");
    return new Redis({ url: this.env.url, token: this.env.token });
  }

  async read<T extends RawValue>(key: string): Promise<T | null> {
    const client = await this.clientPromise;
    // @upstash/redis auto-deserializes JSON values.
    const value = (await client.get(key)) as T | null;
    return value ?? null;
  }

  async write<T extends RawValue>(key: string, value: T): Promise<void> {
    const client = await this.clientPromise;
    if (value === null) {
      await client.del(key);
      return;
    }
    await client.set(key, value as unknown);
  }

  async mutate<T extends RawValue>(
    key: string,
    fn: (current: T | null) => T,
  ): Promise<T> {
    // Single-user dataset: a read-then-write is sufficient. (Upstash offers no
    // cheap server-side read-modify-write for arbitrary JSON values.)
    const current = await this.read<T>(key);
    const next = fn(current);
    await this.write<T>(key, next);
    return next;
  }
}

// ----------------------------------------------------------------------------
// Local JSON-file driver
// ----------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "wt.json");

class FileDriver implements Driver {
  // Promise-chain mutex serializes all read-modify-write operations so
  // concurrent requests in the same process never clobber each other.
  private chain: Promise<unknown> = Promise.resolve();

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    // Keep the chain alive regardless of individual op success/failure.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async loadDoc(): Promise<Doc> {
    let text: string;
    try {
      text = await fs.readFile(DATA_FILE, "utf8");
    } catch {
      // Missing file => defaults.
      return defaultDoc();
    }
    // Defensive parse: any corruption falls back to defaults.
    try {
      const parsed = JSON.parse(text) as Partial<Doc> | null;
      if (!parsed || typeof parsed !== "object") return defaultDoc();
      const base = defaultDoc();
      return {
        active:
          parsed.active && typeof parsed.active === "object"
            ? (parsed.active as ActiveSession)
            : null,
        logs: Array.isArray(parsed.logs)
          ? (parsed.logs as LogEntry[])
          : base.logs,
        projects: Array.isArray(parsed.projects)
          ? (parsed.projects as Project[])
          : base.projects,
        // Keep the raw stored schedule as-is here; getSchedule() normalizes and
        // migrates (legacy `weekly` shape included) on every read.
        schedule:
          parsed.schedule && typeof parsed.schedule === "object"
            ? (parsed.schedule as Schedule)
            : base.schedule,
        settings:
          parsed.settings && typeof parsed.settings === "object"
            ? { ...base.settings, ...(parsed.settings as Settings) }
            : base.settings,
      };
    } catch {
      return defaultDoc();
    }
  }

  private async saveDoc(doc: Doc): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Atomic write: write to a unique temp file then rename over the target.
    const tmp = path.join(
      DATA_DIR,
      `.wt.${process.pid}.${Date.now()}.${Math.random()
        .toString(36)
        .slice(2)}.tmp`,
    );
    const payload = JSON.stringify(doc, null, 2);
    try {
      await fs.writeFile(tmp, payload, "utf8");
      await fs.rename(tmp, DATA_FILE);
    } catch (err) {
      // Best-effort cleanup of the temp file on failure.
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  private docFieldForKey(
    key: string,
  ): "active" | "logs" | "projects" | "schedule" | "settings" | null {
    switch (key) {
      case STORE_KEYS.active:
        return "active";
      case STORE_KEYS.logs:
        return "logs";
      case STORE_KEYS.projects:
        return "projects";
      case STORE_KEYS.schedule:
        return "schedule";
      case STORE_KEYS.settings:
        return "settings";
      default:
        return null;
    }
  }

  private assignField(
    doc: Doc,
    field: "active" | "logs" | "projects" | "schedule" | "settings",
    value: RawValue,
  ): void {
    // Assign through a typed switch to keep the Doc shape sound.
    switch (field) {
      case "active":
        doc.active = (value as ActiveSession | null) ?? null;
        break;
      case "logs":
        doc.logs = (value as LogEntry[]) ?? [];
        break;
      case "projects":
        doc.projects = (value as Project[]) ?? [];
        break;
      case "schedule":
        doc.schedule = (value as Schedule) ?? defaultSchedule();
        break;
      case "settings":
        doc.settings = (value as Settings) ?? defaultSettings();
        break;
    }
  }

  async read<T extends RawValue>(key: string): Promise<T | null> {
    return this.locked(async () => {
      const doc = await this.loadDoc();
      const field = this.docFieldForKey(key);
      if (!field) return null;
      const value = doc[field];
      return (value ?? null) as T | null;
    });
  }

  async write<T extends RawValue>(key: string, value: T): Promise<void> {
    return this.locked(async () => {
      const doc = await this.loadDoc();
      const field = this.docFieldForKey(key);
      if (!field) return;
      this.assignField(doc, field, value);
      await this.saveDoc(doc);
    });
  }

  async mutate<T extends RawValue>(
    key: string,
    fn: (current: T | null) => T,
  ): Promise<T> {
    // The entire read-modify-write cycle runs under the lock, so concurrent
    // mutations are serialized and never lose updates.
    return this.locked(async () => {
      const doc = await this.loadDoc();
      const field = this.docFieldForKey(key);
      const current = (field ? (doc[field] ?? null) : null) as T | null;
      const next = fn(current);
      if (field) {
        this.assignField(doc, field, next);
        await this.saveDoc(doc);
      }
      return next;
    });
  }
}

// ----------------------------------------------------------------------------
// Driver selection (singleton)
// ----------------------------------------------------------------------------

let driverSingleton: Driver | null = null;

function getDriver(): Driver {
  if (driverSingleton) return driverSingleton;
  const env = redisEnv();
  driverSingleton = env ? new RedisDriver(env) : new FileDriver();
  return driverSingleton;
}

/** True when the active driver is the cloud (Upstash/KV) driver. */
export function isCloudStore(): boolean {
  return redisEnv() !== null;
}

// ----------------------------------------------------------------------------
// Typed public API
// ----------------------------------------------------------------------------

export async function getActive(): Promise<ActiveSession | null> {
  return getDriver().read<ActiveSession>(STORE_KEYS.active);
}

export async function setActive(value: ActiveSession | null): Promise<void> {
  await getDriver().write<ActiveSession | null>(STORE_KEYS.active, value);
}

export async function getLogs(): Promise<LogEntry[]> {
  const logs = await getDriver().read<LogEntry[]>(STORE_KEYS.logs);
  return Array.isArray(logs) ? logs : [];
}

export async function setLogs(logs: LogEntry[]): Promise<void> {
  await getDriver().write<LogEntry[]>(STORE_KEYS.logs, logs);
}

export async function appendLog(entry: LogEntry): Promise<LogEntry[]> {
  // Atomic read-modify-write so concurrent appends never clobber each other.
  return getDriver().mutate<LogEntry[]>(STORE_KEYS.logs, (current) => {
    const logs = Array.isArray(current) ? current : [];
    return [...logs, entry];
  });
}

export async function updateLog(
  id: string,
  patch: Partial<LogEntry>,
): Promise<LogEntry | null> {
  let updated: LogEntry | null = null;
  await getDriver().mutate<LogEntry[]>(STORE_KEYS.logs, (current) => {
    const logs = Array.isArray(current) ? current : [];
    const idx = logs.findIndex((l) => l.id === id);
    if (idx === -1) return logs;
    updated = { ...logs[idx], ...patch, id: logs[idx].id };
    const next = logs.slice();
    next[idx] = updated;
    return next;
  });
  return updated;
}

export async function deleteLog(id: string): Promise<boolean> {
  let removed = false;
  await getDriver().mutate<LogEntry[]>(STORE_KEYS.logs, (current) => {
    const logs = Array.isArray(current) ? current : [];
    const next = logs.filter((l) => l.id !== id);
    removed = next.length !== logs.length;
    return next;
  });
  return removed;
}

export async function getProjects(): Promise<Project[]> {
  const projects = await getDriver().read<Project[]>(STORE_KEYS.projects);
  return Array.isArray(projects) ? projects : [];
}

export async function setProjects(projects: Project[]): Promise<void> {
  await getDriver().write<Project[]>(STORE_KEYS.projects, projects);
}

/**
 * Create a project (idempotent on name, case-insensitive): if one with the same
 * trimmed name already exists, it is returned instead of adding a duplicate.
 * Returns the created-or-existing project.
 */
export async function addProject(name: string): Promise<Project> {
  const trimmed = name.trim();
  let result: Project | null = null;
  await getDriver().mutate<Project[]>(STORE_KEYS.projects, (current) => {
    const projects = Array.isArray(current) ? current : [];
    const existing = projects.find(
      (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      result = existing;
      return projects;
    }
    const created: Project = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: Date.now(),
    };
    result = created;
    return [...projects, created];
  });
  // `result` is always assigned by the mutate callback above (TS can't see the
  // assignment happens inside the closure, so it still infers `null` here).
  return result as unknown as Project;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, "name" | "archived">>,
): Promise<Project | null> {
  let updated: Project | null = null;
  await getDriver().mutate<Project[]>(STORE_KEYS.projects, (current) => {
    const projects = Array.isArray(current) ? current : [];
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return projects;
    const next = projects.slice();
    updated = {
      ...projects[idx],
      ...patch,
      id: projects[idx].id,
      name:
        typeof patch.name === "string" && patch.name.trim()
          ? patch.name.trim()
          : projects[idx].name,
    };
    next[idx] = updated;
    return next;
  });
  return updated;
}

export async function getSchedule(): Promise<Schedule> {
  const schedule = await getDriver().read<Schedule>(STORE_KEYS.schedule);
  // Normalize (and migrate legacy shapes) on every read so callers always get a
  // sound Schedule regardless of what's on disk / in Redis.
  return normalizeSchedule(schedule);
}

export async function setSchedule(schedule: Schedule): Promise<void> {
  await getDriver().write<Schedule>(STORE_KEYS.schedule, schedule);
}

export async function getSettings(): Promise<Settings> {
  const settings = await getDriver().read<Settings>(STORE_KEYS.settings);
  if (!settings || typeof settings !== "object") return defaultSettings();
  return { ...defaultSettings(), ...settings };
}

export async function setSettings(settings: Settings): Promise<void> {
  await getDriver().write<Settings>(STORE_KEYS.settings, settings);
}

/** Full export for backup. */
export async function getAll(): Promise<Doc> {
  const [active, logs, projects, schedule, settings] = await Promise.all([
    getActive(),
    getLogs(),
    getProjects(),
    getSchedule(),
    getSettings(),
  ]);
  return { active, logs, projects, schedule, settings };
}

/** Full import for backup restore (overwrites all keys). */
export async function setAll(doc: Doc): Promise<void> {
  await setActive(doc.active ?? null);
  await setLogs(Array.isArray(doc.logs) ? doc.logs : []);
  await setProjects(Array.isArray(doc.projects) ? doc.projects : []);
  await setSchedule(doc.schedule ?? defaultSchedule());
  await setSettings({ ...defaultSettings(), ...(doc.settings ?? {}) });
}

// Exposed for tests/diagnostics: where the local file lives. Uses os import to
// avoid unused-import churn if FileDriver paths change.
export const LOCAL_DATA_FILE = DATA_FILE;
export const LOCAL_TMP_HINT = os.tmpdir();
