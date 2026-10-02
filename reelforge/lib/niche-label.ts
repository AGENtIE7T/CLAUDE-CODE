import nichesData from "./niches.json";

/** Client-safe (no fs) niche label helper. */
export function nicheLabelClient(inputs: { niche: string; custom_niche?: string }): string {
  if (inputs.niche === "other") return inputs.custom_niche || "Other";
  return nichesData.niches.find((n) => n.id === inputs.niche)?.label ?? inputs.niche;
}
