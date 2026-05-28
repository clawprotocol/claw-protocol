/**
 * Pro operational agreement synthesis — pre-API context + post-generation passes.
 */

import type { AgreementFamily } from "../agreementFamilyRouter";
import type { ParsedDraftShape } from "../intakeSmartDefaults";
import type { PremiumFullDraftContextPayload } from "../premiumFullDraftApi";
import { extractPartyResponsibilities } from "./responsibilityExtraction";
import { classifyDealDna } from "./dealDnaClassifier";
import { applySectionPurityPass } from "./sectionPurityValidator";
import { applyOperationalSpecificityPass } from "./operationalSpecificityPass";
import { applyRepetitionCompressionPass } from "./repetitionCompressionPass";
import {
  applyMilestoneTableGeneration,
  mergePartyRolesFromResponsibilities,
} from "./milestoneTableGeneration";
import {
  buildCommercialFactGraph,
  commercialFactGraphToGuidanceLines,
} from "./commercialFactGraph";

export { applyMilestoneTableGeneration } from "./milestoneTableGeneration";
import { applyEnterpriseReadabilityPass } from "./enterpriseReadabilityPass";
import type {
  ProOperationalSynthesisPassLog,
  ProOperationalSynthesisResult,
} from "./types";

export type { ProOperationalSynthesisResult, ProOperationalSynthesisPassLog } from "./types";
export { extractPartyResponsibilities } from "./responsibilityExtraction";
export { classifyDealDna } from "./dealDnaClassifier";
export { parseAgreementSections, applySectionPurityPass } from "./sectionPurityValidator";
export {
  buildCommercialFactGraph,
  commercialFactGraphToGuidanceLines,
  aiWorkflowPremiumQualitySignals,
  extractJointVentureEconomicsAnchors,
  isJointVentureEconomicsIntake,
} from "./commercialFactGraph";

const SYNTHESIS_MARKER = "LawDog Pro operational synthesis (internal guidance — not boilerplate to paste verbatim):";

function formatModelGuidanceBlock(
  result: Omit<ProOperationalSynthesisResult, "modelGuidanceBlock">,
  rawIntake: string,
): string {
  const lines: string[] = [
    SYNTHESIS_MARKER,
    `Deal archetype: ${result.dealDna.archetype} (${result.dealDna.confidence} confidence).`,
    `Drafting: ${result.dealDna.draftingStyle}; governance: ${result.dealDna.governanceComplexity}; specificity: ${result.dealDna.specificityLevel}.`,
    "Prioritize operational sections weighted by archetype (scope, milestones, governance, SLA, IP as signaled).",
    "Use full legal entity names in signatures; short names only in operational references.",
    "Avoid generic enterprise filler — anchor obligations to the responsibilities below.",
  ];
  for (const p of result.responsibilities) {
    lines.push(
      `- ${p.party} (${p.shortName}, ${p.inferredRole}): ${p.responsibilities.slice(0, 4).join("; ") || "operational duties per intake"}`,
    );
  }
  const factLines = commercialFactGraphToGuidanceLines(result.commercialFactGraph, rawIntake);
  if (factLines.length) {
    lines.push(...factLines.map((line) => `- ${line}`));
  }
  return lines.join("\n");
}

/**
 * Build structured synthesis from intake + draft before premium-full-draft API call.
 */
export function buildProOperationalSynthesis(
  rawIntake: string,
  draft: ParsedDraftShape,
  opts?: { agreementFamily?: AgreementFamily | null },
): ProOperationalSynthesisResult {
  const partyNames = (draft.parties || []).map((p) => p.name).filter(Boolean);
  const responsibilities = extractPartyResponsibilities(rawIntake, partyNames);
  const dealDna = classifyDealDna(rawIntake, {
    agreementFamily: opts?.agreementFamily ?? (draft.agreement_family as AgreementFamily | undefined) ?? null,
    partyCount: responsibilities.length || partyNames.length,
  });
  const commercialFactGraph = buildCommercialFactGraph(rawIntake, draft);

  const materialAskLines: string[] = [];
  if (dealDna.archetype !== "generic_commercial") {
    materialAskLines.push(`Structure as ${dealDna.archetype.replace(/_/g, " ")} with operational specificity.`);
  }
  for (const p of responsibilities) {
    if (p.responsibilities.length) {
      materialAskLines.push(`${p.shortName} (${p.inferredRole}): ${p.responsibilities.slice(0, 3).join("; ")}`);
    }
  }
  if (dealDna.governanceComplexity === "enterprise") {
    materialAskLines.push("Include governance: steering cadence, escalation, and cross-party dependencies.");
  }
  if (/\bmilestones?\b/i.test(rawIntake)) {
    materialAskLines.push("Include milestone schedule, acceptance criteria, and implementation dependencies.");
  }
  materialAskLines.push(...commercialFactGraphToGuidanceLines(commercialFactGraph, rawIntake));

  const base = { responsibilities, dealDna, commercialFactGraph, materialAskLines };
  return {
    ...base,
    modelGuidanceBlock: formatModelGuidanceBlock(base, rawIntake),
  };
}

/**
 * Enrich premium full-draft API context with operational synthesis (pre-LLM).
 */
export function enrichPremiumContextWithOperationalSynthesis(
  ctx: PremiumFullDraftContextPayload,
  rawIntake: string,
  draft: ParsedDraftShape,
): PremiumFullDraftContextPayload {
  const synthesis = buildProOperationalSynthesis(rawIntake, draft, {
    agreementFamily: (ctx.agreement_family as AgreementFamily) || null,
  });

  const existingAdditional = (ctx.additional_terms || "").trim();
  const additional_terms = existingAdditional.includes(SYNTHESIS_MARKER)
    ? existingAdditional
    : existingAdditional
      ? `${existingAdditional}\n\n${synthesis.modelGuidanceBlock}`
      : synthesis.modelGuidanceBlock;

  const material_asks = [
    ...(ctx.material_asks || []),
    ...synthesis.materialAskLines,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32);

  const parties = mergePartyRolesFromResponsibilities(ctx.parties, synthesis.responsibilities);

  return { ...ctx, additional_terms, material_asks, parties };
}

/**
 * Post-generation operational passes (deterministic; idempotent-friendly).
 */
export function applyProOperationalSynthesisPasses(
  text: string,
  intakeRaw: string,
  synthesis: ProOperationalSynthesisResult,
  opts?: { paymentTerms?: string },
): { text: string; log: ProOperationalSynthesisPassLog } {
  let working = text;

  const specificity = applyOperationalSpecificityPass(
    working,
    synthesis.responsibilities,
    synthesis.dealDna,
  );
  working = specificity.text;

  const repetition = applyRepetitionCompressionPass(working);
  working = repetition.text;

  const purity = applySectionPurityPass(working);
  working = purity.text;

  const milestone = applyMilestoneTableGeneration(
    working,
    intakeRaw,
    opts?.paymentTerms ?? "",
    synthesis.responsibilities,
  );
  working = milestone.text;

  const readability = applyEnterpriseReadabilityPass(working);
  working = readability.text;

  const log: ProOperationalSynthesisPassLog = {
    operationalSpecificity: { replaced: specificity.replaced },
    repetitionCompression: { diversified: repetition.diversified },
    sectionPurity: { issues: purity.issues.length, relocated: purity.issues.filter((i) => i.action === "removed").length },
    milestoneTable: { inserted: milestone.inserted },
    enterpriseReadability: { hedgesReduced: readability.hedgesReduced },
  };

  if (import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[pro-operational-synthesis]", log);
  }

  return { text: working, log };
}
