"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { allPlainText, scoreFor, toMarkdown } from "@/lib/format";
import { ApiError, downloadFile, formatCost, slug, streamGenerate, type Stage } from "@/lib/client";
import type { GenerationRecord } from "@/lib/schema";
import { getGeneration, getSettings, saveGeneration } from "@/lib/storage";
import { HookAnalysisList } from "./HookAnalysisList";
import { ScriptCard } from "./ScriptCard";
import { Collapsible, CopyButton, Empty, ErrorBox, List, Progress, useHydrated } from "./ui";

export function ResultsView({ id }: { id: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [rec, setRec] = useState<GenerationRecord | undefined>();
  const [stage, setStage] = useState<Stage | null>(null);
  const [failure, setFailure] = useState<{ message: string; requestId?: string; retry: () => void } | null>(null);

  useEffect(() => setRec(getGeneration(id)), [id]);

  if (!hydrated) return null;
  if (!rec)
    return (
      <Empty title="Ye result nahi mila">
        It may have been deleted, or it was saved in another browser. <Link className="text-brand underline" href="/history">Check History</Link> or{" "}
        <Link className="text-brand underline" href="/">generate new scripts</Link>.
      </Empty>
    );

  const o = rec.output;
  const model = getSettings().model || undefined;

  async function run(body: unknown, retry: () => void) {
    setFailure(null);
    setStage("audience");
    try {
      const next = await streamGenerate(body, setStage);
      saveGeneration(next);
      router.push(`/results/${next.id}`);
    } catch (e) {
      setStage(null);
      setFailure({ message: (e as Error).message, requestId: e instanceof ApiError ? e.requestId : undefined, retry });
    }
  }
  const regenerate = () => run({ inputs: rec!.inputs, model }, regenerate);
  const regenWeakest = () => run({ action: "regenerate_weakest", record: rec, model }, regenWeakest);

  if (stage) return <Progress stage={stage} />;

  const batchWarnings = rec.checks.final.filter((f) => f.script_id === null);
  const titleOf = (sid: string) => o.scripts.find((s) => s.id === sid)?.title ?? sid;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {rec.mode} · {new Date(rec.created_at).toLocaleString("en-IN")}
        </p>
        <h1 className="h1">{rec.inputs.business_name}</h1>
        <p className="text-sm text-zinc-500">
          {rec.inputs.sub_niche} · {rec.inputs.area}, {rec.inputs.city}
        </p>
        <p className="mt-2 text-xs italic text-zinc-500">{rec.critic.honesty_note}</p>
      </div>

      {failure && <ErrorBox message={failure.message} requestId={failure.requestId} onRetry={failure.retry} />}

      {batchWarnings.map((w, i) => (
        <p key={i} className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠ {w.message}
        </p>
      ))}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CopyButton label="Copy all" getText={() => allPlainText(rec)} />
        <button type="button" className="btn-ghost" onClick={() => downloadFile(`${slug(rec.inputs.business_name)}-reels.md`, toMarkdown(rec))}>
          Download .md
        </button>
        <button type="button" className="btn-ghost" onClick={regenerate}>
          Regenerate
        </button>
        <button type="button" className="btn-ghost" onClick={regenWeakest} disabled={o.scripts.length < 2} title={o.scripts.length < 2 ? "Needs at least 2 scripts" : ""}>
          Redo weakest
        </button>
      </div>

      <Collapsible title="Assumptions" badge={<span className="chip">{o.assumptions.length}</span>}>
        <List items={o.assumptions} />
      </Collapsible>
      <Collapsible title="Audience & pain map">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm font-bold">Pains</p><List items={o.audience_map.pains} /></div>
          <div><p className="text-sm font-bold">Desires</p><List items={o.audience_map.desires} /></div>
          <div><p className="text-sm font-bold">Objections</p><List items={o.audience_map.objections} /></div>
          <div><p className="text-sm font-bold">Relatable references</p><List items={o.audience_map.relatable_refs} /></div>
        </div>
        <p className="mt-3 text-sm"><b>Key emotion:</b> {o.audience_map.key_emotion}</p>
      </Collapsible>
      <Collapsible title="Niche strategy">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-sm font-bold">Pillars</p><List items={o.niche_strategy.pillars} /></div>
          <div><p className="text-sm font-bold">Trust triggers</p><List items={o.niche_strategy.trust_triggers} /></div>
          <div><p className="text-sm font-bold">Visuals</p><List items={o.niche_strategy.visuals} /></div>
          <div><p className="text-sm font-bold">Niche hooks</p><List items={o.niche_strategy.niche_hooks} /></div>
          <div><p className="text-sm font-bold">Seasonal moments</p><List items={o.niche_strategy.seasonal_moments} /></div>
          <div><p className="text-sm font-bold">Common mistakes</p><List items={o.niche_strategy.common_mistakes} /></div>
          <div className="sm:col-span-2"><p className="text-sm font-bold">Cautions</p><List items={o.niche_strategy.cautions} /></div>
        </div>
      </Collapsible>
      {o.hook_analysis.length > 0 && (
        <Collapsible title="Reference hook analysis" badge={<span className="chip">{o.hook_analysis.length}</span>}>
          <HookAnalysisList items={o.hook_analysis} />
        </Collapsible>
      )}

      {o.scripts.map((s, i) => (
        <ScriptCard key={s.id} genId={rec.id} rank={i + 1} script={s} score={scoreFor(rec, s.id)} warnings={rec.checks.final.filter((f) => f.script_id === s.id)} />
      ))}

      <section className="card space-y-3">
        <h2 className="h2">🧪 Testing plan</h2>
        <div>
          <p className="text-sm font-bold">Post first</p>
          <ul className="mt-1 space-y-1 text-sm">
            {o.testing_plan.post_first.map((p, i) => (
              <li key={i}>
                <a className="font-semibold text-brand" href={`#script-${p.script_id}`}>{titleOf(p.script_id)}</a>: {p.reason}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold">A/B hooks for the strongest script</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
            {o.testing_plan.ab_hooks.map((h, i) => <li key={i}>{h}</li>)}
          </ol>
        </div>
        <p className="text-sm"><b>Watch after 48h:</b> {o.testing_plan.metrics}</p>
        <p className="text-sm"><b>If it flops:</b> {o.testing_plan.if_flops}</p>
        <p className="text-sm"><b>If it works:</b> {o.testing_plan.if_works}</p>
        <p className="text-sm"><b>Posting frequency:</b> {o.testing_plan.posting_frequency}</p>
        <p className="text-sm"><b>Next seasonal moment:</b> {o.testing_plan.next_seasonal_moment}</p>
        {rec.critic.weakest_note && <p className="text-sm"><b>Critic on the weakest:</b> {rec.critic.weakest_note}</p>}
        {rec.critic.similarity_flags.length > 0 && (
          <div><p className="text-sm font-bold">Similarity flags</p><List items={rec.critic.similarity_flags} /></div>
        )}
      </section>

      <p className="text-center text-xs text-zinc-400">
        {formatCost(rec.usage)} · {rec.usage.calls} API calls · {rec.model} · prompt v{rec.prompt_version}
        {rec.used_past_performance && " · used past performance"}
      </p>
    </div>
  );
}
