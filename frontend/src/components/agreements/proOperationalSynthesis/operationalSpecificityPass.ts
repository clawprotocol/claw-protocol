/**
 * Replace vague operational coordination language with structured specificity.
 */

import type { DealDnaProfile, PartyResponsibilityProfile } from "./types";

const VAGUE_COORDINATION_RE =
  /\bThe\s+Parties\s+shall\s+coordinate\b[^.!?]*[.!?]/gi;

const VAGUE_GENERAL_RE =
  /\b(?:Parties\s+shall\s+work\s+together|mutually\s+agree\s+to\s+cooperate|as\s+mutually\s+agreed|from\s+time\s+to\s+time)\b[^.!?]*[.!?]/gi;

function buildCoordinationReplacement(
  responsibilities: readonly PartyResponsibilityProfile[],
  dealDna: DealDnaProfile,
): string {
  const ops = new Set<string>([
    "deployment sequencing",
    "API dependency readiness",
    "migration scheduling",
    "launch approvals",
    "acceptance testing",
  ]);
  for (const p of responsibilities) {
    for (const r of p.responsibilities) {
      const lower = r.toLowerCase();
      if (lower.includes("migrat")) ops.add("migration scheduling");
      if (lower.includes("api")) ops.add("API dependency readiness");
      if (lower.includes("accept")) ops.add("acceptance testing");
      if (lower.includes("governance") || lower.includes("steering")) ops.add("steering committee cadence");
      if (lower.includes("white") || lower.includes("label")) ops.add("white-label configuration");
      if (lower.includes("support")) ops.add("support escalation paths");
    }
  }
  if (dealDna.archetype === "vendor_saas_agreement") {
    ops.add("environment promotion");
    ops.add("incident communication");
  }
  if (dealDna.governanceComplexity === "enterprise") {
    ops.add("cross-party dependency tracking");
  }
  const list = [...ops].slice(0, 8).join(", ");
  return `The Parties shall coordinate ${list} using the operational contact channels set forth in the Notices section.`;
}

/**
 * Inject operational specificity into vague clauses.
 */
export function applyOperationalSpecificityPass(
  text: string,
  responsibilities: readonly PartyResponsibilityProfile[],
  dealDna: DealDnaProfile,
): { text: string; replaced: number } {
  let replaced = 0;
  let out = text;
  const replacement = buildCoordinationReplacement(responsibilities, dealDna);

  out = out.replace(VAGUE_COORDINATION_RE, () => {
    replaced += 1;
    return replacement;
  });

  out = out.replace(VAGUE_GENERAL_RE, (m) => {
    if (m.length < 40) return m;
    replaced += 1;
    return `The Parties shall maintain a written operational plan covering milestones, dependencies, and acceptance criteria, updated as material changes arise.`;
  });

  return { text: out, replaced };
}
