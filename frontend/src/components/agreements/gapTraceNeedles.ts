const DEFAULT_NEEDLES = [
  "mediation",
  "binding arbitration",
  "fair market value",
  "trailing 6 months earnings",
  "independent appraisal",
] as const;

export function gapTraceNeedlesHit(text: string): string[] {
  const t = (text || "").toLowerCase();
  if (!t) return [];
  return DEFAULT_NEEDLES.filter((n) => t.includes(n));
}

