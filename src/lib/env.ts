/**
 * Demo mode lets the whole app run with no external services (no Supabase,
 * no Anthropic key). It turns on automatically when Supabase isn't configured,
 * or explicitly via NEXT_PUBLIC_DEMO_MODE=1.
 *
 * In demo mode: auth is bypassed, data comes from an in-memory seeded store,
 * and content generation uses a deterministic template instead of the LLM.
 */
export function isDemo(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === "1" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function hasAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
