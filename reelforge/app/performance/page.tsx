import { Suspense } from "react";
import { PerformanceDashboard } from "@/components/PerformanceDashboard";

export default function PerformancePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Log what happened after posting. See if the critic&apos;s predictions hold up, and what to make next.</p>
      </div>
      <Suspense>
        <PerformanceDashboard />
      </Suspense>
    </div>
  );
}
