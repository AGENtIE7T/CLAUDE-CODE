"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, postJson, scoreColor } from "@/lib/client";
import { nicheLabelClient } from "@/lib/niche-label";
import { aggregate, describeCorrelation, DIMENSIONS, groupBy, insights, pearson, type Dimension } from "@/lib/stats";
import {
  clientKey,
  deletePerformance,
  getLearnings,
  getSettings,
  listGenerations,
  listPerformance,
  setLearnings,
  upsertPerformance,
  type Learnings,
  type PerformanceEntry,
} from "@/lib/storage";
import type { GenerationRecord } from "@/lib/schema";
import { Collapsible, Empty, ErrorBox, List, useHydrated } from "./ui";

const ScoreScatter = dynamic(() => import("./ScoreScatter"), { ssr: false, loading: () => <div className="h-64" /> });

const NUM_FIELDS: { key: keyof PerformanceEntry; label: string; max?: number }[] = [
  { key: "views", label: "Views" },
  { key: "hold_rate_3s", label: "3-sec hold rate %", max: 100 },
  { key: "avg_watch_pct", label: "Avg watch %", max: 100 },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
  { key: "profile_visits", label: "Profile visits" },
  { key: "dms", label: "DMs / enquiries" },
];

function LogForm({ gen, scriptId, existing, onDone }: { gen: GenerationRecord; scriptId: string; existing?: PerformanceEntry; onDone: () => void }) {
  const script = gen.output.scripts.find((s) => s.id === scriptId);
  const score = gen.critic.scores.find((s) => s.script_id === scriptId);
  const [platform, setPlatform] = useState<PerformanceEntry["platform"]>(existing?.platform ?? "instagram");
  const [postDate, setPostDate] = useState(existing?.post_date ?? new Date().toISOString().slice(0, 10));
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUM_FIELDS.map((f) => [f.key, existing ? String(existing[f.key] ?? "") : ""])),
  );
  const [error, setError] = useState("");
  if (!script) return <p className="text-sm text-red-600">That script no longer exists in this generation.</p>;

  function save() {
    const nums: Record<string, number> = {};
    for (const f of NUM_FIELDS) {
      const raw = vals[f.key as string]?.trim() ?? "";
      const v = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0 || (f.max != null && v > f.max)) {
        setError(`${f.label} must be a number${f.max != null ? ` between 0 and ${f.max}` : " ≥ 0"}.`);
        return;
      }
      nums[f.key as string] = v;
    }
    if (!vals.views?.trim()) {
      setError("Views is required.");
      return;
    }
    upsertPerformance({
      id: existing?.id ?? `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      generation_id: gen.id,
      script_id: script!.id,
      business_name: gen.inputs.business_name,
      client_key: clientKey(gen.inputs.business_name),
      niche: nicheLabelClient(gen.inputs),
      title: script!.title,
      hook_type: script!.hook_type,
      content_pillar: script!.content_pillar,
      emotion: script!.emotion,
      predicted_score: score?.total ?? 0,
      prompt_version: gen.prompt_version,
      platform,
      post_date: postDate,
      created_at: existing?.created_at ?? new Date().toISOString(),
      ...(nums as Pick<PerformanceEntry, "views" | "hold_rate_3s" | "avg_watch_pct" | "likes" | "comments" | "shares" | "saves" | "profile_visits" | "dms">),
    });
    onDone();
  }

  return (
    <div className="card space-y-4 border-brand">
      <div>
        <p className="text-xs font-bold uppercase text-brand">Log real performance</p>
        <p className="text-lg font-black">{script.title}</p>
        <p className="text-xs text-zinc-500">
          {gen.inputs.business_name} · predicted score {score?.total ?? "–"} · {script.hook_type}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pf-platform">Platform</label>
          <select id="pf-platform" className="input" value={platform} onChange={(e) => setPlatform(e.target.value as PerformanceEntry["platform"])}>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube Shorts</option>
            <option value="facebook">Facebook</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pf-date">Post date</label>
          <input id="pf-date" type="date" className="input" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
        </div>
        {NUM_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={`pf-${f.key}`}>{f.label}{f.key === "views" && <span className="text-brand"> *</span>}</label>
            <input
              id={`pf-${f.key}`}
              inputMode="decimal"
              className="input"
              value={vals[f.key as string]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value.replace(/[^\d.]/g, "") }))}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <p className="hint">Wait ~48 hours after posting for meaningful numbers. Instagram: Insights on the reel.</p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={save}>Save</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function ScriptPicker({ gens, onPick }: { gens: GenerationRecord[]; onPick: (genId: string, scriptId: string) => void }) {
  const [genId, setGenId] = useState("");
  const gen = gens.find((g) => g.id === genId);
  if (!gens.length) return null;
  return (
    <Collapsible title="Log a posted script">
      <div className="space-y-3">
        <select className="input" value={genId} onChange={(e) => setGenId(e.target.value)} aria-label="Generation">
          <option value="">Choose a generation…</option>
          {gens.map((g) => (
            <option key={g.id} value={g.id}>
              {g.inputs.business_name} · {new Date(g.created_at).toLocaleDateString("en-IN")}
            </option>
          ))}
        </select>
        {gen && (
          <div className="space-y-2">
            {gen.output.scripts.map((s) => (
              <button key={s.id} type="button" className="btn-ghost w-full justify-between text-left" onClick={() => onPick(gen.id, s.id)}>
                <span className="truncate">{s.title}</span>
                <span className="shrink-0 text-xs text-zinc-500">{gen.critic.scores.find((x) => x.script_id === s.id)?.total ?? "–"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Collapsible>
  );
}

export function PerformanceDashboard() {
  const hydrated = useHydrated();
  const router = useRouter();
  const params = useSearchParams();
  const [entries, setEntries] = useState<PerformanceEntry[]>([]);
  const [gens, setGens] = useState<GenerationRecord[]>([]);
  const [client, setClient] = useState("");
  const [yMetric, setYMetric] = useState<"views" | "saves">("views");
  const [dim, setDim] = useState<Dimension>("hook_type");
  const [logging, setLogging] = useState<{ genId: string; scriptId: string; existing?: PerformanceEntry } | null>(null);
  const [learn, setLearn] = useState<Learnings | undefined>();
  const [learnLoading, setLearnLoading] = useState(false);
  const [learnErr, setLearnErr] = useState<{ message: string; requestId?: string } | null>(null);

  const refresh = useCallback(() => {
    setEntries(listPerformance());
    setGens(listGenerations());
  }, []);
  useEffect(refresh, [refresh]);

  useEffect(() => {
    const g = params.get("log");
    const s = params.get("script");
    if (g && s) {
      const existing = listPerformance().find((e) => e.generation_id === g && e.script_id === s);
      setLogging({ genId: g, scriptId: s, existing });
    }
  }, [params]);

  useEffect(() => setLearn(client ? getLearnings(client) : undefined), [client]);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.client_key, e.business_name);
    return [...m.entries()];
  }, [entries]);
  const shown = useMemo(() => (client ? entries.filter((e) => e.client_key === client) : entries), [entries, client]);
  const r = pearson(shown.map((e) => e.predicted_score), shown.map((e) => e[yMetric]));
  const groups = useMemo(() => groupBy(shown, dim), [shown, dim]);
  const autoInsights = useMemo(() => insights(shown), [shown]);

  async function getLearningsFromModel() {
    if (!client || !shown.length) return;
    setLearnLoading(true);
    setLearnErr(null);
    try {
      const res = await postJson<{ bullets: string[] }>("/api/learnings", { stats: aggregate(shown), model: getSettings().model || undefined });
      const l: Learnings = { bullets: res.bullets, created_at: new Date().toISOString(), posts: shown.length };
      setLearnings(client, l);
      setLearn(l);
    } catch (e) {
      setLearnErr({ message: (e as Error).message, requestId: e instanceof ApiError ? e.requestId : undefined });
    } finally {
      setLearnLoading(false);
    }
  }

  if (!hydrated) return null;

  const loggingGen = logging ? gens.find((g) => g.id === logging.genId) : undefined;
  const closeLog = () => {
    setLogging(null);
    refresh();
    if (params.get("log")) router.replace("/performance");
  };

  return (
    <div className="space-y-4">
      {logging &&
        (loggingGen ? (
          <LogForm key={`${logging.genId}:${logging.scriptId}`} gen={loggingGen} scriptId={logging.scriptId} existing={logging.existing} onDone={closeLog} />
        ) : (
          <ErrorBox message="Couldn't find that generation. It may have been deleted from History." />
        ))}

      <ScriptPicker gens={gens} onPick={(genId, scriptId) => setLogging({ genId, scriptId, existing: entries.find((e) => e.generation_id === genId && e.script_id === scriptId) })} />

      {entries.length === 0 ? (
        <Empty title="Abhi tak kuch post nahi kiya?">
          After you post a reel, tap <b>I posted this</b> on its script card (or use “Log a posted script” above). Add the numbers after ~48 hours and this dashboard will show what actually works.
          {gens.length === 0 && (
            <>
              {" "}
              <Link href="/" className="text-brand underline">Generate scripts first</Link>.
            </>
          )}
        </Empty>
      ) : (
        <>
          <div className="card flex flex-wrap items-center gap-3">
            <label className="label mb-0" htmlFor="client">Client</label>
            <select id="client" className="input w-auto min-w-0 flex-1" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">All clients ({entries.length} posts)</option>
              {clients.map(([k, name]) => (
                <option key={k} value={k}>{name} ({entries.filter((e) => e.client_key === k).length})</option>
              ))}
            </select>
          </div>

          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">Predicted vs actual</h2>
              <div className="flex rounded-xl border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
                {(["views", "saves"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setYMetric(m)} className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${yMetric === m ? "bg-brand text-white" : ""}`}>{m}</button>
                ))}
              </div>
            </div>
            <ScoreScatter points={shown.map((e) => ({ x: e.predicted_score, y: e[yMetric], title: e.title }))} yLabel={yMetric} />
            <p className="text-sm">
              Correlation (r): <b>{r ?? "–"}</b> · {describeCorrelation(r)}
              {r == null && <span className="text-zinc-500"> (needs 3+ posts with different scores)</span>}
            </p>
          </section>

          <section className="card space-y-2">
            <h2 className="h2">💡 Auto-insights</h2>
            <List items={autoInsights} />
          </section>

          <section className="card space-y-3">
            <h2 className="h2">🧠 Learnings for the next batch</h2>
            {!client ? (
              <p className="text-sm text-zinc-500">Pick a client above to get learnings. They&apos;re saved per client and can be added to that client&apos;s next generation.</p>
            ) : (
              <>
                {learn && (
                  <>
                    <List items={learn.bullets} />
                    <p className="hint">From {learn.posts} posts on {new Date(learn.created_at).toLocaleDateString("en-IN")}. Used automatically (you can untick it) when you generate for this client.</p>
                  </>
                )}
                {learnErr && <ErrorBox message={learnErr.message} requestId={learnErr.requestId} onRetry={getLearningsFromModel} />}
                <button type="button" className="btn-primary w-full sm:w-auto" disabled={learnLoading} onClick={getLearningsFromModel}>
                  {learnLoading ? "Data ko nichod rahe hain..." : learn ? "Refresh learnings" : "Get learnings"}
                </button>
                <p className="hint">Only aggregated numbers are sent (no names, captions or dates).</p>
              </>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="h2">Averages by</h2>
            <div className="flex flex-wrap gap-1.5">
              {DIMENSIONS.map((d) => (
                <button key={d.key} type="button" onClick={() => setDim(d.key)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${dim === d.key ? "bg-brand text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>{d.label}</button>
              ))}
            </div>
            <div className="space-y-2">
              {groups.map((g) => (
                <div key={g.group} className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                  <div className="flex justify-between gap-2 font-semibold">
                    <span className="min-w-0 truncate">{g.group}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{g.posts} post{g.posts > 1 ? "s" : ""}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-xs sm:grid-cols-6">
                    <span>👁 {g.avg_views.toLocaleString("en-IN")}</span>
                    <span>🔖 {g.avg_saves}</span>
                    <span>↗ {g.avg_shares}</span>
                    <span>3s {g.avg_hold_rate}%</span>
                    <span>⏱ {g.avg_watch_pct}%</span>
                    <span>★ {g.avg_predicted_score}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card space-y-2">
            <h2 className="h2">All posted scripts</h2>
            {shown.map((e) => {
              const col = scoreColor(e.predicted_score);
              return (
                <div key={e.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.title}</p>
                      <p className="truncate text-xs text-zinc-500">{e.business_name} · {e.platform} · {e.post_date} · {e.hook_type}</p>
                    </div>
                    <span className={`shrink-0 text-xl font-black ${col.text}`}>{e.predicted_score}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs sm:grid-cols-5">
                    <span>👁 {e.views.toLocaleString("en-IN")}</span>
                    <span>3s {e.hold_rate_3s}%</span>
                    <span>⏱ {e.avg_watch_pct}%</span>
                    <span>❤ {e.likes}</span>
                    <span>💬 {e.comments}</span>
                    <span>↗ {e.shares}</span>
                    <span>🔖 {e.saves}</span>
                    <span>👤 {e.profile_visits}</span>
                    <span>✉ {e.dms}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-ghost min-h-[36px] py-1 text-xs" onClick={() => { setLogging({ genId: e.generation_id, scriptId: e.script_id, existing: e }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                    <button type="button" className="btn-ghost min-h-[36px] py-1 text-xs" onClick={() => { if (confirm("Delete this performance log?")) { deletePerformance(e.id); refresh(); } }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
