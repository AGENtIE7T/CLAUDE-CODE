"use client";
/** Browser helpers: streaming generate call, clipboard, downloads. */
import type { GenerationRecord, StreamEvent } from "./schema";

export type Stage = Extract<StreamEvent, { type: "stage" }>["stage"];

export const STAGE_COPY: Record<Stage, string> = {
  audience: "Audience padh rahe hain...",
  writing: "Scripts likh rahe hain...",
  critic: "Critic roast kar raha hai...",
  finalising: "Final touches de rahe hain...",
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

const CLIENT_TIMEOUT_MS = 320_000;

/** POSTs to /api/generate and reads the NDJSON progress stream. */
export async function streamGenerate(body: unknown, onStage: (s: Stage) => void): Promise<GenerationRecord> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new ApiError("This is taking too long. Try again, or ask for fewer scripts.");
      throw new ApiError("Couldn't reach the server. Check your internet and try again.");
    }
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      throw new ApiError(j.error ?? `Request failed (${res.status}).`, j.request_id);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as StreamEvent;
        if (ev.type === "stage") onStage(ev.stage);
        else if (ev.type === "result") return ev.record;
        else if (ev.type === "error") throw new ApiError(ev.message, ev.request_id);
      }
    }
    throw new ApiError("The connection closed before the scripts were ready. Please try again.");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("This is taking too long. Try again, or ask for fewer scripts.");
    throw new ApiError("Something went wrong while reading the response. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson<T>(url: string, body: unknown, timeoutMs = 150_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(j.error ?? `Request failed (${res.status}).`, j.request_id);
    return j as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("This is taking too long. Please try again.");
    throw new ApiError("Couldn't reach the server. Check your internet and try again.");
  } finally {
    clearTimeout(timer);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadFile(name: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "reelforge";
}

export function formatCost(u: { input_tokens: number; output_tokens: number; cost_usd: number | null }) {
  const tok = `${(u.input_tokens / 1000).toFixed(1)}k in / ${(u.output_tokens / 1000).toFixed(1)}k out tokens`;
  return u.cost_usd != null ? `${tok} · ~$${u.cost_usd.toFixed(3)} (~₹${(u.cost_usd * 85).toFixed(1)})` : tok;
}

export function scoreColor(n: number): { text: string; bg: string; bar: string } {
  if (n >= 75) return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", bar: "bg-emerald-500" };
  if (n >= 60) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", bar: "bg-amber-500" };
  return { text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40", bar: "bg-red-500" };
}
