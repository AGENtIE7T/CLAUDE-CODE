"use client";

import { useState, useTransition } from "react";
import { StatusChip } from "@/components/seo/status";
import type { AutopilotRules } from "@/lib/autopilot/rules";
import { saveAutopilotRulesAction, saveProtectedUrlsAction, type SaveResult } from "./actions";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
        {hint}
      </span>
    </label>
  );
}

function NumberInput({ name, value, min, max, step }: { name: string; value: number; min: number; max: number; step?: number }) {
  return (
    <input
      type="number"
      name={name}
      defaultValue={value}
      min={min}
      max={max}
      step={step ?? 1}
      className="w-28 rounded-md border px-3 py-1.5 text-sm"
      style={{ borderColor: "var(--line)", background: "transparent", color: "var(--ink)" }}
    />
  );
}

function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1" />
      <span>
        <span className="text-sm font-medium">{label}</span>
        <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </span>
      </span>
    </label>
  );
}

export function AutopilotRulesForm({
  websiteId,
  rules,
  protectedUrls,
}: {
  websiteId: string;
  rules: AutopilotRules;
  protectedUrls: string[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SaveResult | null>(null);
  const [protResult, setProtResult] = useState<SaveResult | null>(null);

  return (
    <div className="grid gap-6">
      {/* ── protected URLs ───────────────────────────────────────────── */}
      <form
        action={(fd) => start(async () => setProtResult(await saveProtectedUrlsAction(fd)))}
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--card)" }}
      >
        <input type="hidden" name="websiteId" value={websiteId} />
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold">Protected URLs</h3>
          <StatusChip status={protectedUrls.length ? "ok" : "off"}>
            {protectedUrls.length ? `${protectedUrls.length} protected` : "None protected"}
          </StatusChip>
        </div>
        <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          Pages here can never be modified — not by Autopilot, not by an approved
          revision, not by you. The check runs inside the execute engine, after
          approval, so there is no order of operations that gets around it.
        </p>
        <textarea
          name="protectedUrls"
          rows={6}
          defaultValue={protectedUrls.join("\n")}
          placeholder={"/checkout**\n/my-account**\n/cart**\n/legal/**"}
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "transparent", fontFamily: "var(--font-mono)", color: "var(--ink)" }}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
          One pattern per line. <code>*</code> matches within a path segment,{" "}
          <code>**</code> matches across segments. A pasted full URL is reduced to its path.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}
        >
          Save protected URLs
        </button>
        {protResult && (
          <p className="mt-2 text-sm" style={{ color: protResult.ok ? "var(--good)" : "var(--crit)" }}>
            {protResult.message}
          </p>
        )}
      </form>

      {/* ── autopilot rules ──────────────────────────────────────────── */}
      <form
        action={(fd) => start(async () => setResult(await saveAutopilotRulesAction(fd)))}
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--card)" }}
      >
        <input type="hidden" name="websiteId" value={websiteId} />
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold">Autopilot rules</h3>
          <StatusChip status={rules.enabled ? "limited" : "off"}>
            {rules.enabled ? "Enabled" : "Disabled"}
          </StatusChip>
        </div>
        <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
          Autopilot does not get its own way of changing your site. It decides
          whether to issue the same approval you would have clicked, and the
          normal engine does the rest — same hash binding, same staleness check,
          same verification, same rollback.
        </p>

        <div className="grid gap-4">
          <Toggle
            name="enabled"
            defaultChecked={rules.enabled}
            label="Enable Autopilot for this website"
            hint="Off by default. While off, every proposed change waits for your approval."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maximum links per page" hint="How many new links may be added to a single page in one run.">
              <NumberInput name="maxLinksPerPage" value={rules.maxLinksPerPage} min={1} max={10} />
            </Field>
            <Field label="Maximum links to the same destination" hint="Stops one page absorbing every link in a run.">
              <NumberInput name="maxLinksToSameTarget" value={rules.maxLinksToSameTarget} min={1} max={5} />
            </Field>
            <Field label="Maximum pages per run" hint="A hard ceiling on blast radius. Clamped to 200 however this is submitted.">
              <NumberInput name="maxPagesPerRun" value={rules.maxPagesPerRun} min={1} max={200} />
            </Field>
            <Field label="Maximum total changes" hint="Across all pages in one run.">
              <NumberInput name="maxTotalChanges" value={rules.maxTotalChanges} min={1} max={500} />
            </Field>
            <Field label="Minimum confidence" hint="0.80 default. Cannot be set below 0.50 — the clamp is in the code, not the form.">
              <NumberInput name="minimumConfidence" value={rules.minimumConfidence} min={0.5} max={1} step={0.01} />
            </Field>
            <Field label="Approval validity (minutes)" hint="An issued approval expires; a stale one is refused by the engine.">
              <NumberInput name="approvalTtlMinutes" value={rules.approvalTtlMinutes} min={1} max={240} />
            </Field>
          </div>

          <div className="grid gap-3">
            <Toggle
              name="requireBackup"
              defaultChecked={rules.requireBackup}
              label="Require a backup before every write"
              hint="If the backup cannot be taken, the write does not happen."
            />
            <Toggle
              name="requireVerification"
              defaultChecked={rules.requireVerification}
              label="Require post-write verification"
              hint="The page is re-read and must hash to the approved revision."
            />
            <Toggle
              name="stopOnFirstError"
              defaultChecked={rules.stopOnFirstError}
              label="Stop on the first rule violation"
              hint="Refuse the whole batch rather than applying the part that passed."
            />
            <Toggle
              name="rollbackOnVerificationFailure"
              defaultChecked={rules.rollbackOnVerificationFailure}
              label="Roll back automatically if verification fails"
              hint="Restores the exact bytes from the pre-write backup."
            />
            <Toggle
              name="allowProductPages"
              defaultChecked={!rules.excludedPageTypes.includes("product")}
              label="Allow changes to product pages"
              hint="Off by default. Product copy is commercially sensitive and often templated."
            />
            <Toggle
              name="allowProduction"
              defaultChecked={rules.allowedEnvironments.includes("production")}
              label="Allow Autopilot on a production environment"
              hint="Even on, production writes still require SEO_ENABLE_PRODUCTION_WRITES=1 on the server."
            />
          </div>

          <div className="rounded-md border p-3 text-xs" style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}>
            <strong style={{ color: "var(--ink-soft)" }}>Not configurable, by design:</strong> Autopilot
            only ever inserts internal links; it never removes an existing link;
            and legal, medical, financial or compliance pages always route to a
            human approval. These are code paths, not settings.
          </div>

          <button
            type="submit"
            disabled={pending}
            className="justify-self-start rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: "var(--ink)", color: "var(--bg)", opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Saving…" : "Save Autopilot rules"}
          </button>
          {result && (
            <p className="text-sm" style={{ color: result.ok ? "var(--good)" : "var(--crit)" }}>
              {result.message}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
