import nichesData from "./niches.json";

/** Client-safe (no fs) niche label helper. */
export function nicheLabelClient(inputs: { niche: string; custom_niche?: string }): string {
  if (inputs.niche === "other") return inputs.custom_niche || "Other";
  return [...nichesData.niches, ...nichesData.creators].find((n) => n.id === inputs.niche)?.label ?? inputs.niche;
}

/** "Area, City" with empty parts dropped (creators may have no location). */
export function placeText(inputs: { area?: string; city?: string }): string {
  return [inputs.area, inputs.city].filter((x) => x && x.trim()).join(", ");
}
