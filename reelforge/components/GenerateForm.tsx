"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import nichesData from "@/lib/niches.json";
import { ApiError, streamGenerate, type Stage } from "@/lib/client";
import { buildLearningContext } from "@/lib/learning";
import { nicheLabelClient } from "@/lib/niche-label";
import { BusinessInputSchema, LANGUAGE_LABELS, LANGUAGES, ON_CAMERA, TONES, type BusinessInput } from "@/lib/schema";
import {
  clientKey,
  deleteProfile,
  getGeneration,
  getLearnings,
  getSettings,
  listFeedback,
  listGenerations,
  listPerformance,
  listProfiles,
  saveGeneration,
  saveProfile,
  storageAvailable,
  type ClientProfile,
} from "@/lib/storage";
import { ErrorBox, Progress } from "./ui";

type FormState = Omit<BusinessInput, "reference_hooks"> & { reference_hooks_text: string };

const EMPTY: FormState = {
  business_name: "",
  niche: "salon",
  custom_niche: "",
  sub_niche: "",
  city: "",
  area: "",
  target_customer: "",
  offer: "",
  usp: "",
  on_camera: "owner",
  language: "hinglish",
  tones: [],
  festival: "",
  avoid: "",
  reference_hooks_text: "",
  script_count: 3,
  b2b: false,
};

const toForm = (i: BusinessInput): FormState => {
  const { reference_hooks, ...rest } = i;
  return { ...EMPTY, ...rest, reference_hooks_text: reference_hooks.join("\n") };
};

const toInputs = (f: FormState) => {
  const { reference_hooks_text, ...rest } = f;
  return {
    ...rest,
    reference_hooks: reference_hooks_text
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean)
      .slice(0, 10),
  };
};

export function GenerateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [profiles, setProfiles] = useState<ClientProfile[]>([]);
  const [saveAsProfile, setSaveAsProfile] = useState(false);
  const [usePast, setUsePast] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage | null>(null);
  const [failure, setFailure] = useState<{ message: string; requestId?: string } | null>(null);
  const [noStorage, setNoStorage] = useState(false);

  useEffect(() => {
    const s = getSettings();
    setProfiles(listProfiles());
    setNoStorage(!storageAvailable());
    const from = params.get("from");
    const g = from ? getGeneration(from) : undefined;
    if (g) setForm(toForm(g.inputs));
    else setForm((f) => ({ ...f, language: s.default_language, script_count: s.default_script_count }));
  }, [params]);

  const learning = useMemo(() => {
    const key = clientKey(form.business_name);
    return buildLearningContext({
      niche: form.niche,
      nicheLabel: nicheLabelClient(form),
      clientKey: key,
      generations: listGenerations(),
      feedback: listFeedback(),
      performance: listPerformance(),
      clientLearnings: key ? getLearnings(key) : undefined,
    });
  }, [form.business_name, form.niche, form.custom_niche]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onNiche(id: string) {
    const n = nichesData.niches.find((x) => x.id === id);
    setForm((f) => ({ ...f, niche: id, b2b: n ? n.mode === "B2B" : f.b2b }));
  }

  function loadProfile(key: string) {
    const p = profiles.find((x) => x.key === key);
    if (p) {
      setForm(toForm(p.inputs));
      setSaveAsProfile(false);
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setFailure(null);
    const parsed = BusinessInputSchema.safeParse(toInputs(form));
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setErrors({});
    if (saveAsProfile) {
      saveProfile(parsed.data);
      setProfiles(listProfiles());
    }
    const settings = getSettings();
    const past = usePast && learning.text ? learning.text : undefined;
    setStage("audience");
    try {
      const record = await streamGenerate(
        { inputs: parsed.data, past_performance: past, model: settings.model || undefined },
        setStage,
      );
      saveGeneration(record);
      router.push(`/results/${record.id}`);
    } catch (err) {
      setStage(null);
      setFailure({ message: (err as Error).message, requestId: err instanceof ApiError ? err.requestId : undefined });
    }
  }

  if (stage) return <Progress stage={stage} />;

  const field = (k: keyof FormState, label: string, opts: { placeholder?: string; max: number; textarea?: boolean; required?: boolean; hint?: string }) => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>
        {label}
        {opts.required && <span className="text-brand"> *</span>}
      </label>
      {opts.textarea ? (
        <textarea
          id={`f-${k}`}
          className="input min-h-[84px]"
          maxLength={opts.max}
          placeholder={opts.placeholder}
          value={form[k] as string}
          onChange={(e) => set(k, e.target.value as never)}
        />
      ) : (
        <input id={`f-${k}`} className="input" maxLength={opts.max} placeholder={opts.placeholder} value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      )}
      {opts.hint && <p className="hint">{opts.hint}</p>}
      {errors[k] && <p className="mt-1 text-xs font-semibold text-red-600">{errors[k]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {failure && <ErrorBox message={failure.message} requestId={failure.requestId} onRetry={() => submit()} />}
      {noStorage && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Browser storage is blocked, so history won&apos;t survive a refresh. Use Export on the results page to keep your scripts.
        </p>
      )}

      {profiles.length > 0 && (
        <div className="card">
          <label className="label" htmlFor="profile">
            Load a client profile
          </label>
          <div className="flex gap-2">
            <select id="profile" className="input" defaultValue="" onChange={(e) => loadProfile(e.target.value)}>
              <option value="" disabled>
                Choose a saved client…
              </option>
              {profiles.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost shrink-0"
              title="Delete the profile matching the current business name"
              onClick={() => {
                const k = clientKey(form.business_name);
                if (profiles.some((p) => p.key === k) && confirm(`Delete saved profile "${form.business_name}"?`)) {
                  deleteProfile(k);
                  setProfiles(listProfiles());
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="h2">The business</h2>
        {field("business_name", "Business name", { max: 80, required: true, placeholder: "e.g. Glam Studio by Neha" })}
        <div>
          <label className="label" htmlFor="f-niche">
            Niche<span className="text-brand"> *</span>
          </label>
          <select id="f-niche" className="input" value={form.niche} onChange={(e) => onNiche(e.target.value)}>
            {nichesData.niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
            <option value="other">Other</option>
          </select>
        </div>
        {form.niche === "other" && field("custom_niche", "Custom niche", { max: 80, required: true, placeholder: "e.g. pet grooming, travel agency" })}
        {field("sub_niche", "Sub-niche", { max: 160, required: true, placeholder: "e.g. bridal makeup studio, budget unisex salon near college" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("city", "City", { max: 60, required: true, placeholder: "e.g. Gurugram" })}
          {field("area", "Area / locality", { max: 80, required: true, placeholder: "e.g. Sector 56" })}
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" checked={form.b2b} onChange={(e) => set("b2b", e.target.checked)} />
          <span>
            <b>Sells to businesses, not consumers</b>
            <span className="block text-xs text-zinc-500">Switches to B2B mode: trade hashtags, quote/call/WhatsApp CTAs.</span>
          </span>
        </label>
      </div>

      <div className="card space-y-4">
        <h2 className="h2">Audience & offer</h2>
        {field("target_customer", "Target customer", { max: 300, required: true, textarea: true, placeholder: "age, gender, income, what they care about" })}
        {field("offer", "Main offer to push now", { max: 300, required: true, placeholder: "e.g. festive makeup + hair package" })}
        {field("usp", "USP", { max: 300, required: true, placeholder: "even a small one counts" })}
        <div>
          <span className="label">Who&apos;s on camera<span className="text-brand"> *</span></span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ON_CAMERA.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => set("on_camera", o)}
                className={`btn capitalize ${form.on_camera === o ? "bg-brand text-white" : "border border-zinc-300 dark:border-zinc-700"}`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="h2">Style</h2>
        <div>
          <label className="label" htmlFor="f-language">
            Language
          </label>
          <select id="f-language" className="input" value={form.language} onChange={(e) => set("language", e.target.value as FormState["language"])}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Tone (pick any)</span>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => {
              const on = form.tones.includes(t);
              return (
                <button
                  type="button"
                  key={t}
                  aria-pressed={on}
                  onClick={() => set("tones", on ? form.tones.filter((x) => x !== t) : [...form.tones, t])}
                  className={`rounded-full px-3.5 py-2 text-sm font-semibold capitalize ${on ? "bg-brand text-white" : "border border-zinc-300 dark:border-zinc-700"}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="f-script_count">
            Number of scripts: {form.script_count}
          </label>
          <input id="f-script_count" type="range" min={1} max={5} value={form.script_count} onChange={(e) => set("script_count", Number(e.target.value))} className="w-full accent-brand" />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="h2">Optional extras</h2>
        {field("festival", "Upcoming festival / season / event", { max: 120, placeholder: "e.g. Diwali, wedding season, new semester" })}
        {field("avoid", "Things to avoid", { max: 300, placeholder: "e.g. no competitor names, no discount talk" })}
        {field("reference_hooks_text", "Reference hooks (one per line, max 10)", {
          max: 2100,
          textarea: true,
          placeholder: "Paste hooks you liked from other reels",
          hint: "They'll be analysed and rewritten for this business.",
        })}
      </div>

      <div className="card space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={saveAsProfile} onChange={(e) => setSaveAsProfile(e.target.checked)} />
          Save as client profile
        </label>
        {learning.text && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" checked={usePast} onChange={(e) => setUsePast(e.target.checked)} />
            <span>
              Use what ReelForge learned from you
              <span className="block text-xs text-zinc-500">
                {[
                  learning.counts.learnings && `${learning.counts.learnings} client learnings`,
                  learning.counts.nichePosts && `${learning.counts.nichePosts} posted reels in this niche`,
                  learning.counts.liked && `${learning.counts.liked} liked hooks`,
                  learning.counts.disliked && `${learning.counts.disliked} disliked hooks`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        )}
        <button type="submit" className="btn-primary w-full py-3 text-base">
          ✦ Generate {form.script_count} script{form.script_count > 1 ? "s" : ""}
        </button>
      </div>
    </form>
  );
}
