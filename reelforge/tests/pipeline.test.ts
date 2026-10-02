/**
 * Offline end-to-end test of the two-pass pipeline with a mocked Anthropic SDK:
 * generator (first reply invalid -> retry) -> checks -> critic -> merge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const replies: string[] = [];
const requests: { system: string; user: string }[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class FakeAnthropic {
    static APIError = APIError;
    beta = {
      messages: {
        stream: (params: { system: string; messages: { content: string }[] }) => {
          requests.push({ system: params.system, user: params.messages[0].content });
          const text = replies.shift() ?? "";
          return {
            on: (_ev: string, cb: (d: string) => void) => cb(text),
            finalMessage: async () => ({
              content: [{ type: "text", text }],
              stop_reason: "end_turn",
              usage: { input_tokens: 1000, output_tokens: 500 },
            }),
          };
        },
      },
    };
  }
  return { default: FakeAnthropic };
});

const record = JSON.parse(fs.readFileSync(path.join(__dirname, "mocks/record.json"), "utf8"));

describe("runPipeline (mocked SDK)", () => {
  beforeEach(() => {
    replies.length = 0;
    requests.length = 0;
    process.env.ANTHROPIC_API_KEY = "test";
  });

  it("retries invalid generator JSON, runs the critic and merges rewrites", async () => {
    const { runPipeline } = await import("../lib/pipeline");
    const { BusinessInputSchema } = await import("../lib/schema");
    const gen = { ...record.output };
    const rewritten = { ...gen.scripts[2], title: "Rewritten price reveal" };
    const critic = { ...record.critic, rewritten_scripts: [rewritten] };
    replies.push("Sure! Here you go: {not json", "```json\n" + JSON.stringify(gen) + "\n```", JSON.stringify(critic));

    const stages: string[] = [];
    const inputs = BusinessInputSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/salon.json"), "utf8")));
    const rec = await runPipeline({ inputs, model: "claude-sonnet-5-5", onStage: (s) => stages.push(s) });

    expect(requests).toHaveLength(3);
    expect(requests[1].user).toContain("YOUR PREVIOUS ATTEMPT FAILED VALIDATION");
    // Only the selected niche playbook is injected.
    expect(requests[0].system).toContain("Karwa Chauth");
    expect(requests[0].system).not.toContain("RERA");
    expect(requests[0].system).not.toContain("{{");
    expect(requests[2].system).toContain("harsh, experienced short-form content reviewer");
    expect(stages).toEqual(["audience", "writing", "critic", "finalising"]);
    expect(rec.output.scripts.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(rec.output.scripts.find((s) => s.id === "s3")?.title).toBe("Rewritten price reveal");
    expect(rec.critic.scores.find((s) => s.script_id === "s3")?.rewritten).toBe(true);
    expect(rec.usage.calls).toBe(3);
    expect(rec.usage.cost_usd).toBeCloseTo((3000 * 2 + 1500 * 10) / 1e6);
    expect(rec.prompt_version).toBeTruthy();
  });

  it("fails with ModelJsonError after two invalid replies", async () => {
    const { runPipeline } = await import("../lib/pipeline");
    const { ModelJsonError } = await import("../lib/anthropic");
    const { BusinessInputSchema } = await import("../lib/schema");
    replies.push("nope", '{"scripts": []}');
    const inputs = BusinessInputSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/gym.json"), "utf8")));
    await expect(runPipeline({ inputs, model: "claude-sonnet-5-5" })).rejects.toBeInstanceOf(ModelJsonError);
  });
});
