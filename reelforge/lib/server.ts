/** Server-only helpers: rate limiting, request ids, error responses. */
import { NextResponse } from "next/server";
import { ModelJsonError, UserFacingError } from "./anthropic";
import Anthropic from "@anthropic-ai/sdk";

const buckets = new Map<string, number[]>();
const HOUR = 60 * 60 * 1000;

/** Simple in-memory sliding-window limiter (per server instance). */
export function rateLimit(key: string, limit: number): { ok: true } | { ok: false; retryMins: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < HOUR);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryMins: Math.max(1, Math.ceil((HOUR - (now - hits[0])) / 60000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < HOUR)) buckets.delete(k);
  return { ok: true };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function requestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function generationLimit(): number {
  const n = Number(process.env.REELFORGE_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export const MAX_BODY_BYTES = 400_000;

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new UserFacingError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new UserFacingError("Request body must be JSON.", 400);
  }
}

/** Maps any error to a friendly message, logging the detail with the request id. */
export function friendlyError(e: unknown, rid: string, route: string): { message: string; status: number } {
  console.error(`[reelforge] ${route} request_id=${rid}`, e);
  if (e instanceof UserFacingError) return { message: e.message, status: e.status };
  if (e instanceof ModelJsonError)
    return { message: "The AI returned something we couldn't read, even after a retry. Please try again.", status: 502 };
  if (e instanceof Anthropic.APIConnectionTimeoutError)
    return { message: "The AI took too long to respond. Try again, or ask for fewer scripts.", status: 504 };
  if (e instanceof Anthropic.AuthenticationError) return { message: "The server's Anthropic API key is invalid.", status: 500 };
  if (e instanceof Anthropic.RateLimitError) return { message: "The AI service is busy right now. Wait a minute and try again.", status: 429 };
  if (e instanceof Anthropic.NotFoundError) return { message: "That model name wasn't found. Check Settings → Model.", status: 400 };
  if (e instanceof Anthropic.BadRequestError) return { message: "The AI service rejected the request. Check the model name in Settings.", status: 400 };
  if (e instanceof Anthropic.APIError) return { message: "The AI service had a problem. Please try again.", status: 502 };
  return { message: "Something went wrong on our side. Please try again.", status: 500 };
}

export function errorJson(message: string, status: number, rid: string) {
  return NextResponse.json({ error: message, request_id: rid }, { status });
}
