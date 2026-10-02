"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" role="alert">
      <p className="text-lg font-bold text-red-700 dark:text-red-300">Arre, page hi gir gaya.</p>
      <p className="mt-1 text-sm">Something broke while showing this page. Your saved data is safe.</p>
      {error.digest && <p className="hint">Error id: {error.digest}</p>}
      <button type="button" className="btn-primary mt-3" onClick={reset}>Try again</button>
    </div>
  );
}
