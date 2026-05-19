/**
 * Deal DNA — agreement archetype inference for clause weighting and drafting tone.
 */

import type { AgreementFamily } from "../agreementFamilyRouter";
import { extractBetweenPartyNameList } from "../partyBetweenParse";
import type { DealDnaArchetype, DealDnaProfile } from "./types";

const ARCHETYPE_SIGNALS: readonly { archetype: DealDnaArchetype; re: RegExp; weight: number }[] = [
  {
    archetype: "multi_party_implementation_consortium",
    re: /\b(?:consortium|joint\s+(?:rollout|implementation)|among\s+\w+.*,.*and\s+\w+|multi[-\s]?party\s+implementation)\b/i,
    weight: 3,
  },
  {
    archetype: "joint_venture_rollout",
    re: /\b(?:joint\s+(?:venture|project|rollout)|co[-\s]?development|shared\s+infrastructure)\b/i,
    weight: 2,
  },
  { archetype: "vendor_saas_agreement", re: /\b(?:saas|software\s+as\s+a\s+service|subscription|platform|api|uptime|sla)\b/i, weight: 2 },
  { archetype: "managed_services_agreement", re: /\b(?:managed\s+services|msp|operations\s+support|run[-\s]?book)\b/i, weight: 2 },
  { archetype: "reseller_agreement", re: /\b(?:reseller|resale|channel\s+partner|white[-\s]?label)\b/i, weight: 3 },
  { archetype: "licensing_agreement", re: /\b(?:license|licensing|intellectual\s+property\s+license|end[-\s]?user\s+license)\b/i, weight: 2 },
  { archetype: "contractor_services_agreement", re: /\b(?:independent\s+contractor|freelance|consulting|sow|statement\s+of\s+work|hourly)\b/i, weight: 2 },
  { archetype: "nda_confidentiality", re: /\b(?:nda|non[-\s]?disclosure|confidentiality\s+agreement)\b/i, weight: 4 },
];

function defaultWeights(): Record<string, number> {
  return {
    scope: 1,
    milestones: 1,
    governance: 1,
    sla: 1,
    ip: 1,
    payment: 1,
    termination: 0.8,
    dispute: 0.7,
  };
}

function weightsForArchetype(archetype: DealDnaArchetype): Record<string, number> {
  const base = defaultWeights();
  switch (archetype) {
    case "multi_party_implementation_consortium":
    case "joint_venture_rollout":
      return { ...base, governance: 1.4, milestones: 1.5, scope: 1.3, sla: 1.2 };
    case "vendor_saas_agreement":
      return { ...base, sla: 1.6, ip: 1.2, payment: 1.1 };
    case "managed_services_agreement":
      return { ...base, sla: 1.5, scope: 1.2, governance: 1.2 };
    case "reseller_agreement":
      return { ...base, ip: 1.3, payment: 1.2, scope: 1.1 };
    case "licensing_agreement":
      return { ...base, ip: 1.6, payment: 1.1 };
    case "contractor_services_agreement":
      return { ...base, scope: 1.3, payment: 1.2, ip: 1.1 };
    case "nda_confidentiality":
      return { scope: 0.6, confidentiality: 1.8, ip: 1.2, payment: 0.4, milestones: 0.3 };
    default:
      return base;
  }
}

/**
 * Classify deal archetype from intake text and party topology.
 */
export function classifyDealDna(
  intakeRaw: string,
  opts?: { agreementFamily?: AgreementFamily | null; partyCount?: number },
): DealDnaProfile {
  const intake = String(intakeRaw || "");
  const partyCount = opts?.partyCount ?? extractBetweenPartyNameList(intake).length;
  const scores = new Map<DealDnaArchetype, number>();

  for (const { archetype, re, weight } of ARCHETYPE_SIGNALS) {
    if (re.test(intake)) {
      scores.set(archetype, (scores.get(archetype) ?? 0) + weight);
    }
  }
  if (partyCount >= 4) {
    scores.set(
      "multi_party_implementation_consortium",
      (scores.get("multi_party_implementation_consortium") ?? 0) + 4,
    );
    if (/\b(?:joint|rollout|implementation|infrastructure|among)\b/i.test(intake)) {
      scores.set("joint_venture_rollout", (scores.get("joint_venture_rollout") ?? 0) + 3);
    }
    if (/\bwhite[-\s]?label\b/i.test(intake)) {
      scores.set("reseller_agreement", (scores.get("reseller_agreement") ?? 0) - 1);
    }
  } else if (partyCount === 3) {
    scores.set("joint_venture_rollout", (scores.get("joint_venture_rollout") ?? 0) + 1);
  }

  const family = opts?.agreementFamily ?? null;
  if (family === "nda" || family === "confidentiality_commercial_protections_agreement") {
    scores.set("nda_confidentiality", (scores.get("nda_confidentiality") ?? 0) + 3);
  }

  let archetype: DealDnaArchetype = "generic_commercial";
  let best = 0;
  for (const [a, s] of scores) {
    if (s > best) {
      best = s;
      archetype = a;
    }
  }

  const confidence: DealDnaProfile["confidence"] = best >= 3 ? "high" : best >= 1 ? "medium" : "low";
  const specificityLevel: DealDnaProfile["specificityLevel"] =
    archetype === "nda_confidentiality" ? "standard" : partyCount >= 3 ? "high" : "medium";
  const governanceComplexity: DealDnaProfile["governanceComplexity"] =
    partyCount >= 4 || archetype === "multi_party_implementation_consortium" ? "enterprise" : partyCount >= 3 ? "standard" : "light";

  const signals = [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([a, s]) => `${a}:${s}`);

  return {
    archetype,
    confidence,
    specificityLevel,
    governanceComplexity,
    draftingStyle: confidence === "high" ? "operational" : "balanced",
    clauseWeights: weightsForArchetype(archetype),
    signals,
  };
}
