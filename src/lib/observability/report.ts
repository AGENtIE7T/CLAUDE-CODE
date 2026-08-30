/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Error reporting — structured, redacted, pluggable.
 * ─────────────────────────────────────────────────────────────────────────
 *  An error report travels further than any other data in the system: to a
 *  third-party monitoring service, into alert emails, onto dashboards. So the
 *  one rule that matters here is that a credential can never ride along.
 *
 *  `redact()` runs over the message, the stack, and every context value before
 *  anything is emitted, and the context is restricted to primitives so a whole
 *  request object cannot be attached by accident.
 *
 *  The sink is pluggable and defaults to structured stderr, which every host
 *  (Vercel included) already collects. Wiring Sentry or similar is a matter of
 *  calling `setErrorSink()` at startup — no dependency is imposed here.
 */

export type Severity = "info" | "warning" | "error" | "fatal";

export interface ErrorReport {
  severity: Severity;
  message: string;
  /** Stable identifier for grouping, e.g. "cms.write_failed". */
  kind: string;
  stack?: string;
  context: Record<string, string | number | boolean | null>;
  at: string;
}

export type ErrorSink = (report: ErrorReport) => void;

/** Patterns that must never leave the process. */
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /Basic\s+[A-Za-z0-9+/=]+/gi,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /([?&](?:key|token|secret|password|api_key|apikey)=)[^&\s]+/gi,
  /("(?:key|token|secret|password)"\s*:\s*")[^"]+/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
];

/** Strip anything credential-shaped. Applied to every field, every time. */
export function redact(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, p1?: string) => (p1 ? `${p1}[redacted]` : "[redacted]"));
  }
  // Also drop any value that matches a configured secret verbatim.
  for (const name of ["WORDPRESS_APP_PASSWORD", "SEMRUSH_API_KEY", "AHREFS_API_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = process.env[name];
    if (value && value.length > 6) out = out.split(value).join("[redacted]");
  }
  return out;
}

function defaultSink(report: ErrorReport): void {
  // Structured single-line JSON: greppable, and safe to ship to any collector.
  process.stderr.write(`${JSON.stringify(report)}\n`);
}

let sink: ErrorSink = defaultSink;

/** Install a different sink (Sentry, Datadog, …) at startup. */
export function setErrorSink(next: ErrorSink): void {
  sink = next;
}

export function resetErrorSink(): void {
  sink = defaultSink;
}

export function reportError(
  error: unknown,
  opts: {
    kind: string;
    severity?: Severity;
    context?: Record<string, string | number | boolean | null | undefined>;
  },
): ErrorReport {
  const raw = error instanceof Error ? error : new Error(String(error));
  const context: ErrorReport["context"] = {};
  for (const [k, v] of Object.entries(opts.context ?? {})) {
    if (v === undefined) continue;
    context[k] = typeof v === "string" ? redact(v) : v;
  }

  const report: ErrorReport = {
    severity: opts.severity ?? "error",
    kind: opts.kind,
    message: redact(raw.message),
    ...(raw.stack ? { stack: redact(raw.stack) } : {}),
    context,
    at: new Date().toISOString(),
  };
  sink(report);
  return report;
}
