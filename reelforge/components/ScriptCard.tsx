"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { captionText, scriptPlainText } from "@/lib/format";
import { scoreColor } from "@/lib/client";
import { CRITERIA, type CheckFailure, type CriterionKey, type CriticScore, type Script } from "@/lib/schema";
import { getFeedback, setFeedback } from "@/lib/storage";
import { CopyButton } from "./ui";

function ScoreBars({ score }: { score: CriticScore }) {
  const [open, setOpen] = useState<CriterionKey | null>(null);
  return (
    <div className="space-y-2">
      {CRITERIA.map((c) => {
        const v = score.breakdown[c.key];
        const pct = (v / c.max) * 100;
        const col = scoreColor(pct);
        return (
          <div key={c.key}>
            <button type="button" className="w-full text-left" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key}>
              <div className="flex justify-between text-xs font-semibold">
                <span>{c.label}</span>
                <span>
                  {v}/{c.max} <span className="text-zinc-400">{open === c.key ? "▴" : "▾"}</span>
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className={`h-full rounded-full ${col.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
            {open === c.key && <p className="mt-1 rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-800">{score.justifications[c.key] || "No justification given."}</p>}
          </div>
        );
      })}
      <p className="hint">Tap a bar to see why.</p>
    </div>
  );
}

function Feedback({ genId, scriptId }: { genId: string; scriptId: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const f = getFeedback(genId, scriptId);
    if (f) {
      setVote(f.vote);
      setNote(f.note);
    }
  }, [genId, scriptId]);
  const persist = (v: typeof vote, n: string) => {
    setFeedback(genId, scriptId, { vote: v, note: n });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {(["up", "down"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={vote === v}
            aria-label={v === "up" ? "Thumbs up" : "Thumbs down"}
            className={`btn ${vote === v ? (v === "up" ? "bg-emerald-500 text-white" : "bg-red-500 text-white") : "border border-zinc-300 dark:border-zinc-700"}`}
            onClick={() => {
              const nv = vote === v ? null : v;
              setVote(nv);
              persist(nv, note);
            }}
          >
            {v === "up" ? "👍" : "👎"}
          </button>
        ))}
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      {vote && (
        <input className="input text-sm" maxLength={300} placeholder="Optional note: what's good or off?" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => persist(vote, note)} />
      )}
    </div>
  );
}

export function ScriptCard({ genId, rank, script: s, score, warnings }: { genId: string; rank: number; script: Script; score?: CriticScore; warnings: CheckFailure[] }) {
  const [more, setMore] = useState(false);
  const col = score ? scoreColor(score.total) : null;
  return (
    <article className="card space-y-4" id={`script-${s.id}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">#{rank} · {s.id}</p>
          <h3 className="text-xl font-black leading-tight">{s.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip">🪝 {s.hook_type}</span>
            <span className="chip">{s.content_pillar}</span>
            <span className="chip">{s.emotion}</span>
            <span className="chip">{s.length_sec}s</span>
            <span className="chip capitalize">🎥 {s.on_camera}</span>
            {score?.rewritten && <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">Rewritten by critic</span>}
          </div>
        </div>
        {score && col && (
          <div className={`shrink-0 rounded-2xl px-3 py-2 text-center ${col.bg}`}>
            <div className={`text-4xl font-black leading-none ${col.text}`}>{score.total}</div>
            <div className="text-[10px] font-semibold text-zinc-500">/100</div>
          </div>
        )}
      </header>

      {warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-bold">⚠ Automated checks still failing</p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-2xl bg-zinc-900 p-4 text-white dark:bg-black">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand">Hook · 0-2s</p>
        <p className="mt-2 text-2xl font-black leading-tight sm:text-3xl">&ldquo;{s.hook.spoken}&rdquo;</p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-white/10 p-2">
            <p className="text-[10px] font-bold uppercase text-zinc-400">First frame</p>
            {s.hook.visual}
          </div>
          <div className="rounded-lg bg-white/10 p-2">
            <p className="text-[10px] font-bold uppercase text-zinc-400">On-screen text</p>
            <b>{s.hook.on_screen_text}</b>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-dashed border-brand/50 bg-brand-soft/40 p-3 dark:bg-brand/10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand">Reel summary</p>
        <p className="mt-1 text-sm">{s.reel_summary}</p>
      </section>

      <section>
        <p className="mb-2 text-sm font-bold">Beats</p>
        <ol className="relative ml-2 space-y-3 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
          {s.beats.map((b, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-brand" />
              <p className="text-xs font-bold text-zinc-500">
                {b.start}s – {b.end}s
              </p>
              <p className="text-sm">{b.visual}</p>
              {b.spoken && <p className="text-sm font-semibold">🗣 &ldquo;{b.spoken}&rdquo;</p>}
              {b.on_screen_text && <p className="text-xs text-zinc-500">📝 {b.on_screen_text}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
          <p className="text-xs font-bold uppercase text-zinc-500">Payoff</p>
          {s.payoff}
        </div>
        <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
          <p className="text-xs font-bold uppercase text-zinc-500">CTA</p>
          &ldquo;{s.cta.spoken}&rdquo;
          {s.cta.on_screen_text && <span className="block text-xs text-zinc-500">On screen: {s.cta.on_screen_text}</span>}
        </div>
      </section>

      {score && (
        <section>
          <p className="mb-2 text-sm font-bold">Score breakdown</p>
          <ScoreBars score={score} />
          {score.violations.length > 0 && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
              <p className="font-bold">Critic flagged{score.rewritten ? " (in the original, before rewrite)" : ""}</p>
              <ul className="mt-1 list-disc pl-4">
                {score.violations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <button type="button" className="btn-ghost w-full" onClick={() => setMore((m) => !m)} aria-expanded={more}>
        {more ? "Hide shooting notes & caption ▴" : "Shooting notes, audio & caption ▾"}
      </button>
      {more && (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-bold">📱 How to shoot</p>
            <ul className="mt-1 space-y-1">
              <li><b>Location:</b> {s.shooting.location}</li>
              <li><b>Props:</b> {s.shooting.props.join(", ")}</li>
              <li><b>Phone setup:</b> {s.shooting.phone_setup}</li>
              <li><b>B-roll:</b> {s.shooting.broll.join(" · ")}</li>
              <li><b>Editing tip:</b> {s.shooting.editing_tip}</li>
            </ul>
          </div>
          <div>
            <p className="font-bold">🎵 Audio</p>
            <p>{s.audio}</p>
          </div>
          <div>
            <p className="font-bold">✍️ Caption</p>
            <p className="whitespace-pre-wrap">{s.caption}</p>
            <p className="mt-1 text-brand">{s.hashtags.join(" ")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">Why it could work</p>
              {s.why_it_works}
            </div>
            <div className="rounded-xl bg-red-50 p-3 dark:bg-red-950/30">
              <p className="text-xs font-bold uppercase text-red-700 dark:text-red-400">Biggest risk</p>
              {s.biggest_risk}
            </div>
          </div>
        </div>
      )}

      <footer className="space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-2">
          <CopyButton label="Copy script" getText={() => scriptPlainText(s, score)} />
          <CopyButton label="Copy caption + tags" getText={() => captionText(s)} />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Feedback genId={genId} scriptId={s.id} />
          <Link href={`/performance?log=${encodeURIComponent(genId)}&script=${encodeURIComponent(s.id)}`} className="btn-primary">
            I posted this
          </Link>
        </div>
      </footer>
    </article>
  );
}
