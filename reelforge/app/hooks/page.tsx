"use client";

import { useEffect, useState } from "react";
import nichesData from "@/lib/niches.json";
import { ApiError, formatCost, postJson } from "@/lib/client";
import { LANGUAGE_LABELS, LANGUAGES, type HookAnalysisItem } from "@/lib/schema";
import { getSettings } from "@/lib/storage";
import { HookAnalysisList } from "@/components/HookAnalysisList";
import { Empty, ErrorBox } from "@/components/ui";

type Lang = (typeof LANGUAGES)[number];
interface HooksResponse {
  hook_analysis: HookAnalysisItem[];
  usage: { input_tokens: number; output_tokens: number; cost_usd: number | null };
}

export default function HooksPage() {
  const [text, setText] = useState("");
  const [niche, setNiche] = useState("salon");
  const [custom, setCustom] = useState("");
  const [language, setLanguage] = useState<Lang>("hinglish");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<HooksResponse | null>(null);
  const [err, setErr] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => setLanguage(getSettings().default_language), []);

  const hooks = text.split("\n").map((h) => h.trim()).filter(Boolean);
  const tooMany = hooks.length > 10;

  async function analyse() {
    if (!hooks.length || tooMany) return;
    if (niche === "other" && !custom.trim()) {
      setErr({ message: "Type the custom niche first." });
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await postJson<HooksResponse>("/api/hooks", {
        hooks: hooks.map((h) => h.slice(0, 200)),
        niche,
        custom_niche: custom.trim() || undefined,
        language,
        model: getSettings().model || undefined,
      });
      setRes(r);
    } catch (e) {
      setErr({ message: (e as Error).message, requestId: e instanceof ApiError ? e.requestId : undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Hook Analyzer</h1>
        <p className="mt-1 text-sm text-zinc-500">Paste hooks from reels you liked (or your own). Get a teardown, a score and a stronger rewrite for your niche.</p>
      </div>
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="hooks">Hooks (one per line, up to 10)</label>
          <textarea id="hooks" className="input min-h-[160px]" maxLength={2200} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Gurgaon mein 99% log ye galti karte hain\nPOV: tumhari mummy ne pehli baar cafe ka bill dekha"} />
          <p className={`hint ${tooMany ? "font-semibold text-red-600" : ""}`}>{hooks.length}/10 hooks{tooMany ? " — remove some" : ""}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="niche">Niche</label>
            <select id="niche" className="input" value={niche} onChange={(e) => setNiche(e.target.value)}>
              <optgroup label="Businesses">{nichesData.niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</optgroup>
              <optgroup label="Creators">{nichesData.creators.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</optgroup>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lang">Rewrite language</label>
            <select id="lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
            </select>
          </div>
        </div>
        {niche === "other" && (
          <div>
            <label className="label" htmlFor="custom">Custom niche</label>
            <input id="custom" className="input" maxLength={80} value={custom} onChange={(e) => setCustom(e.target.value)} />
          </div>
        )}
        <button type="button" className="btn-primary w-full" disabled={loading || !hooks.length || tooMany} onClick={analyse}>
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Hooks ka post-mortem chal raha hai...
            </>
          ) : (
            "Analyse hooks"
          )}
        </button>
      </div>
      {err && <ErrorBox message={err.message} requestId={err.requestId} onRetry={analyse} />}
      {res ? (
        <>
          <HookAnalysisList items={res.hook_analysis} />
          <p className="text-center text-xs text-zinc-400">{formatCost(res.usage)}</p>
        </>
      ) : (
        !loading && !err && (
          <Empty title="Koi hook nahi daala abhi">Paste a few hooks above. Tip: include ones that flopped too, the comparison teaches more.</Empty>
        )
      )}
    </div>
  );
}
