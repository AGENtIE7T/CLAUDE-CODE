"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { scoreColor } from "@/lib/client";
import { nicheLabelClient } from "@/lib/niche-label";
import type { GenerationRecord } from "@/lib/schema";
import { deleteGeneration, listGenerations, MAX_GENERATIONS } from "@/lib/storage";
import { Empty, useHydrated } from "@/components/ui";

export default function HistoryPage() {
  const hydrated = useHydrated();
  const [gens, setGens] = useState<GenerationRecord[]>([]);
  useEffect(() => setGens(listGenerations()), []);
  if (!hydrated) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">History</h1>
        <p className="mt-1 text-sm text-zinc-500">Your last {MAX_GENERATIONS} generations, saved in this browser. Export from Settings to keep a backup.</p>
      </div>
      {gens.length === 0 ? (
        <Empty title="Khaali hai abhi">
          Nothing generated yet. <Link href="/" className="text-brand underline">Fill the form</Link> and your scripts will show up here.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {gens.map((g) => {
            const top = Math.max(0, ...g.critic.scores.map((s) => s.total));
            const col = scoreColor(top);
            return (
              <li key={g.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/results/${g.id}`} className="min-w-0">
                    <p className="truncate text-lg font-black">{g.inputs.business_name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {nicheLabelClient(g.inputs)} · {g.inputs.area}, {g.inputs.city}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(g.created_at).toLocaleString("en-IN")} · {g.output.scripts.length} scripts · {g.mode}
                    </p>
                  </Link>
                  <div className={`shrink-0 rounded-xl px-2.5 py-1 text-center ${col.bg}`}>
                    <div className={`text-2xl font-black ${col.text}`}>{top}</div>
                    <div className="text-[10px] text-zinc-500">top</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Link href={`/results/${g.id}`} className="btn-primary">Open</Link>
                  <Link href={`/?from=${encodeURIComponent(g.id)}`} className="btn-ghost">Duplicate</Link>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      if (confirm(`Delete scripts for "${g.inputs.business_name}"? Performance logs are kept.`)) {
                        deleteGeneration(g.id);
                        setGens(listGenerations());
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
