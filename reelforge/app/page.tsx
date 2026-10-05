import { Suspense } from "react";
import { GenerateForm } from "@/components/GenerateForm";

export default function GeneratePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Reel scripts that actually get shot.</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Fill in a business or your creator profile. Get hook-first scripts a non-actor can film in 30 minutes, scored by a separate critic.
        </p>
      </div>
      <Suspense>
        <GenerateForm />
      </Suspense>
    </div>
  );
}
