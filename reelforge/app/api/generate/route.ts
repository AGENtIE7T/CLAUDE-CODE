import { z } from "zod";
import { resolveModel, UserFacingError } from "@/lib/anthropic";
import { regenerateWeakest, runPipeline, type Stage } from "@/lib/pipeline";
import { BusinessInputSchema, CriticOutputSchema, GenerateRequestSchema, GeneratorOutputSchema, type GenerationRecord, type StreamEvent } from "@/lib/schema";
import { clientIp, errorJson, friendlyError, generationLimit, rateLimit, readJson, requestId } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const WeakestSchema = z.object({
  action: z.literal("regenerate_weakest"),
  model: GenerateRequestSchema.shape.model,
  record: z
    .object({
      inputs: BusinessInputSchema,
      output: GeneratorOutputSchema,
      critic: CriticOutputSchema,
    })
    .passthrough(),
});

export async function POST(req: Request) {
  const rid = requestId();
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (e) {
    const f = friendlyError(e, rid, "generate");
    return errorJson(f.message, f.status, rid);
  }

  const weakest = WeakestSchema.safeParse(body);
  const fresh = weakest.success ? null : GenerateRequestSchema.safeParse(body);
  if (!weakest.success && !fresh?.success) {
    const issue = fresh?.error.issues[0];
    return errorJson(issue ? `Invalid ${issue.path.join(".")}: ${issue.message}` : "Invalid request.", 400, rid);
  }

  const limit = rateLimit(`gen:${clientIp(req)}`, generationLimit());
  if (!limit.ok) {
    return errorJson(`Bas bhai, thoda break. You've hit ${generationLimit()} generations this hour. Try again in ~${limit.retryMins} min.`, 429, rid);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      const onStage = (stage: Stage) => send({ type: "stage", stage });
      // Keep-alive so proxies don't drop a long, silent connection.
      const ping = setInterval(() => controller.enqueue(encoder.encode("\n")), 15_000);
      try {
        let record: GenerationRecord;
        if (weakest.success) {
          const r = weakest.data.record as unknown as GenerationRecord;
          if (r.output.scripts.length < 2) throw new UserFacingError("Need at least 2 scripts to replace the weakest one.", 400);
          record = await regenerateWeakest(r, resolveModel(weakest.data.model), onStage);
        } else {
          const d = fresh!.data!;
          record = await runPipeline({ inputs: d.inputs, model: resolveModel(d.model), pastPerformance: d.past_performance, onStage });
        }
        send({ type: "result", record });
      } catch (e) {
        const f = friendlyError(e, rid, "generate");
        send({ type: "error", message: f.message, request_id: rid });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Request-Id": rid },
  });
}
