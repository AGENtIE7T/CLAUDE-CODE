/**
 * Safe localStorage wrapper. Every read/write is wrapped in try/catch, and an
 * in-memory copy is kept so the app still works for the current tab when
 * storage is blocked (private mode, disabled site data, quota errors).
 */
import type { BusinessInput, GenerationRecord } from "./schema";

export const KEYS = {
  generations: "rf_generations",
  feedback: "rf_feedback",
  performance: "rf_performance",
  profiles: "rf_profiles",
  learnings: "rf_learnings",
  settings: "rf_settings",
} as const;
type Key = (typeof KEYS)[keyof typeof KEYS];

export const MAX_GENERATIONS = 50;

const memory = new Map<string, string>();

function getStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__rf_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
  return getStore() !== null;
}

function read<T>(key: Key, fallback: T): T {
  let raw: string | null | undefined = null;
  try {
    raw = getStore()?.getItem(key);
  } catch {
    raw = null;
  }
  if (raw == null) raw = memory.get(key) ?? null;
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns false if the value could only be kept in memory. */
function write(key: Key, value: unknown): boolean {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    const s = getStore();
    if (!s) return false;
    s.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

// ---------- Generations ----------

export function listGenerations(): GenerationRecord[] {
  return read<GenerationRecord[]>(KEYS.generations, []);
}

export function getGeneration(id: string): GenerationRecord | undefined {
  return listGenerations().find((g) => g.id === id);
}

export function saveGeneration(rec: GenerationRecord): boolean {
  const rest = listGenerations().filter((g) => g.id !== rec.id);
  return write(KEYS.generations, [rec, ...rest].slice(0, MAX_GENERATIONS));
}

export function deleteGeneration(id: string): void {
  write(
    KEYS.generations,
    listGenerations().filter((g) => g.id !== id),
  );
}

// ---------- Feedback ----------

export interface Feedback {
  vote: "up" | "down" | null;
  note: string;
  updated_at: string;
}
const fbKey = (genId: string, scriptId: string) => `${genId}:${scriptId}`;

export function listFeedback(): Record<string, Feedback> {
  return read<Record<string, Feedback>>(KEYS.feedback, {});
}

export function getFeedback(genId: string, scriptId: string): Feedback | undefined {
  return read<Record<string, Feedback>>(KEYS.feedback, {})[fbKey(genId, scriptId)];
}

export function setFeedback(genId: string, scriptId: string, fb: Omit<Feedback, "updated_at">): void {
  const all = read<Record<string, Feedback>>(KEYS.feedback, {});
  all[fbKey(genId, scriptId)] = { ...fb, updated_at: new Date().toISOString() };
  write(KEYS.feedback, all);
}

// ---------- Performance ----------

export interface PerformanceEntry {
  id: string;
  generation_id: string;
  script_id: string;
  // Denormalised so stats survive deleting the generation.
  business_name: string;
  client_key: string;
  niche: string;
  title: string;
  hook_type: string;
  content_pillar: string;
  emotion: string;
  predicted_score: number;
  prompt_version: string;
  platform: "instagram" | "youtube" | "facebook" | "other";
  post_date: string;
  views: number;
  hold_rate_3s: number;
  avg_watch_pct: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profile_visits: number;
  dms: number;
  created_at: string;
}

export function listPerformance(): PerformanceEntry[] {
  return read<PerformanceEntry[]>(KEYS.performance, []);
}

export function upsertPerformance(entry: PerformanceEntry): void {
  const rest = listPerformance().filter((e) => e.id !== entry.id);
  write(KEYS.performance, [entry, ...rest]);
}

export function deletePerformance(id: string): void {
  write(
    KEYS.performance,
    listPerformance().filter((e) => e.id !== id),
  );
}

// ---------- Client profiles ----------

export interface ClientProfile {
  key: string;
  name: string;
  inputs: BusinessInput;
  saved_at: string;
}

export function clientKey(businessName: string): string {
  return businessName.trim().toLowerCase().replace(/\s+/g, " ");
}

export function listProfiles(): ClientProfile[] {
  return read<ClientProfile[]>(KEYS.profiles, []);
}

export function saveProfile(inputs: BusinessInput): void {
  const key = clientKey(inputs.business_name);
  const rest = listProfiles().filter((p) => p.key !== key);
  write(KEYS.profiles, [{ key, name: inputs.business_name, inputs, saved_at: new Date().toISOString() }, ...rest]);
}

export function deleteProfile(key: string): void {
  write(
    KEYS.profiles,
    listProfiles().filter((p) => p.key !== key),
  );
}

// ---------- Learnings (per client) ----------

export interface Learnings {
  bullets: string[];
  created_at: string;
  posts: number;
}

export function getLearnings(key: string): Learnings | undefined {
  return read<Record<string, Learnings>>(KEYS.learnings, {})[key];
}

export function setLearnings(key: string, l: Learnings): void {
  const all = read<Record<string, Learnings>>(KEYS.learnings, {});
  all[key] = l;
  write(KEYS.learnings, all);
}

// ---------- Settings ----------

export interface Settings {
  model: string; // "" = server default
  default_script_count: number;
  default_language: "hinglish" | "hindi_roman" | "english";
}
export const DEFAULT_SETTINGS: Settings = { model: "", default_script_count: 3, default_language: "hinglish" };

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) };
}

export function saveSettings(s: Settings): void {
  write(KEYS.settings, s);
}

// ---------- Export / import / clear ----------

export interface ExportBundle {
  app: "reelforge";
  version: 1;
  exported_at: string;
  data: Record<string, unknown>;
}

export function exportAll(): ExportBundle {
  const data: Record<string, unknown> = {};
  for (const k of Object.values(KEYS)) data[k] = read<unknown>(k, null);
  return { app: "reelforge", version: 1, exported_at: new Date().toISOString(), data };
}

/** Merges imported arrays/maps with existing data (imported wins on id clashes). */
export function importAll(raw: unknown): { ok: boolean; message: string } {
  const b = raw as Partial<ExportBundle>;
  if (!b || b.app !== "reelforge" || typeof b.data !== "object" || b.data === null) {
    return { ok: false, message: "This doesn't look like a ReelForge export file." };
  }
  const d = b.data as Record<string, unknown>;
  const mergeArr = <T extends Record<string, unknown>>(key: Key, idField: string, cap?: number) => {
    const incoming = Array.isArray(d[key]) ? (d[key] as T[]) : [];
    const existing = read<T[]>(key, []);
    const ids = new Set(incoming.map((x) => x[idField]));
    const merged = [...incoming, ...existing.filter((x) => !ids.has(x[idField]))];
    write(key, cap ? merged.slice(0, cap) : merged);
    return incoming.length;
  };
  const mergeMap = (key: Key) => {
    const incoming = d[key] && typeof d[key] === "object" && !Array.isArray(d[key]) ? (d[key] as object) : {};
    write(key, { ...read<object>(key, {}), ...incoming });
  };
  const g = mergeArr(KEYS.generations, "id", MAX_GENERATIONS);
  const p = mergeArr(KEYS.performance, "id");
  mergeArr(KEYS.profiles, "key");
  mergeMap(KEYS.feedback);
  mergeMap(KEYS.learnings);
  if (d[KEYS.settings] && typeof d[KEYS.settings] === "object") write(KEYS.settings, d[KEYS.settings]);
  return { ok: true, message: `Imported ${g} generations and ${p} performance logs.` };
}

export function clearAll(): void {
  for (const k of Object.values(KEYS)) {
    memory.delete(k);
    try {
      getStore()?.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
