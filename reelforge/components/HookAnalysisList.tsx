"use client";

import type { HookAnalysisItem } from "@/lib/schema";
import { scoreColor } from "@/lib/client";
import { CopyButton } from "./ui";

const ROWS: [keyof HookAnalysisItem, string][] = [
  ["type", "Type"],
  ["first_frame", "First frame"],
  ["first_words", "First words"],
  ["pattern_interrupt", "Pattern interrupt"],
  ["curiosity_gap", "Curiosity gap"],
  ["specificity", "Specificity"],
  ["emotion", "Emotion"],
  ["niche_fit", "Niche fit"],
  ["payoff", "Payoff check"],
];

export function HookAnalysisList({ items }: { items: HookAnalysisItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((h, i) => {
        const col = scoreColor(h.score_10 * 10);
        return (
          <div key={i} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">&ldquo;{h.original}&rdquo;</p>
              <span className={`shrink-0 text-2xl font-black ${col.text}`}>
                {h.score_10}
                <span className="text-xs text-zinc-400">/10</span>
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{h.reason}</p>
            <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
              {ROWS.map(([k, label]) => (
                <div key={k}>
                  <dt className="inline font-bold">{label}: </dt>
                  <dd className="inline">{String(h[k])}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm dark:bg-emerald-950/30">
              <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Stronger rewrite</p>
              <p className="font-semibold">{h.rewrite}</p>
            </div>
            <div className="mt-2">
              <CopyButton label="Copy rewrite" getText={() => h.rewrite} className="btn-ghost w-full sm:w-auto" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
