"use client";

import { useEffect, useRef, useState } from "react";
import { downloadFile } from "@/lib/client";
import { LANGUAGE_LABELS, LANGUAGES } from "@/lib/schema";
import { clearAll, exportAll, getSettings, importAll, saveSettings, storageAvailable, type Settings, DEFAULT_SETTINGS } from "@/lib/storage";
import { useHydrated } from "@/components/ui";

export default function SettingsPage() {
  const hydrated = useHydrated();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [available, setAvailable] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setS(getSettings());
    setAvailable(storageAvailable());
  }, []);
  if (!hydrated) return null;

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };

  function save() {
    const model = s.model.trim();
    if (model && !/^claude-[a-z0-9.-]+$/i.test(model)) return flash(false, "Model must look like claude-sonnet-5-5 (or leave blank for the server default).");
    saveSettings({ ...s, model });
    flash(true, "Settings saved.");
  }

  async function onImport(file: File) {
    try {
      if (file.size > 20_000_000) return flash(false, "File is too large.");
      const r = importAll(JSON.parse(await file.text()));
      flash(r.ok, r.message);
      setS(getSettings());
    } catch {
      flash(false, "Couldn't read that file. Is it a ReelForge JSON export?");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="h1">Settings</h1>
      {!available && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Browser storage is blocked here. Data lives only in this tab until you export it.
        </p>
      )}
      {msg && (
        <p role="status" className={`rounded-xl p-3 text-sm font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <section className="card space-y-4">
        <h2 className="h2">Defaults</h2>
        <div>
          <label className="label" htmlFor="model">Model override</label>
          <input id="model" className="input" maxLength={64} placeholder="Blank = server default (claude-sonnet-5-5)" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
          <p className="hint">e.g. claude-opus-5-5 for higher quality (costs more), claude-haiku-4-5 for cheaper drafts.</p>
        </div>
        <div>
          <label className="label" htmlFor="count">Default number of scripts: {s.default_script_count}</label>
          <input id="count" type="range" min={1} max={5} value={s.default_script_count} onChange={(e) => setS({ ...s, default_script_count: Number(e.target.value) })} className="w-full accent-brand" />
        </div>
        <div>
          <label className="label" htmlFor="lang">Default language</label>
          <select id="lang" className="input" value={s.default_language} onChange={(e) => setS({ ...s, default_language: e.target.value as Settings["default_language"] })}>
            {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={save}>Save settings</button>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Your data</h2>
        <p className="text-sm text-zinc-500">Everything (history, feedback, performance logs, client profiles, learnings) lives in this browser only. Export regularly so nothing is lost.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" className="btn-ghost" onClick={() => downloadFile(`reelforge-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(), null, 2), "application/json")}>
            Export all data
          </button>
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>Import data</button>
          <button
            type="button"
            className="btn border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => {
              if (confirm("Delete ALL ReelForge data in this browser? Export first if you want a backup.") && confirm("Pakka? This can't be undone.")) {
                clearAll();
                setS(getSettings());
                flash(true, "All data cleared.");
              }
            }}
          >
            Clear all data
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        <p className="hint">Import merges with what&apos;s already here; matching items are replaced by the imported copy.</p>
      </section>
    </div>
  );
}
