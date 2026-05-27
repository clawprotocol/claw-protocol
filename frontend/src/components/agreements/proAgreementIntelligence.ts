import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validateProAgreementConfidenceGate } from "./proFullAgreementCandidate";
import { extractDealVariables } from "./guidedDealCompletion/missingVariableExtractor";
import type { DealVariable, GuidedQuestionType } from "./guidedDealCompletion/types";

export type ProAgreementIntelligencePacket = {
  draftText: string;
  semanticFacts: {
    parties?: string[];
    scope?: string[];
    payment?: string[];
    ownership?: string[];
    confidentiality?: boolean;
    termination?: string[];
    governingLaw?: string;
    notices?: string;
    support?: string[];
  };
  refinementOpportunities: {
    id: string;
    type: "CLARIFICATION" | "OPTIMIZATION" | "RISK_ALLOCATION" | "OPTIONAL_ENHANCEMENT";
    semanticIntent: string;
    question: string;
    reason: string;
    suggestedAnswer?: string;
    priority: "high" | "medium" | "low";
    ownerSection?: string;
  }[];
  riskSpots: {
    id: string;
    issue: string;
    severity: "high" | "medium" | "low";
    recommendedFix?: string;
    ownerSection?: string;
  }[];
  confidence: {
    draftCompleteness: number;
    commercialSpecificity: number;
    legalCoherence: number;
  };
};

export type GovernedProQuestions = {
  variables: DealVariable[];
  prunedIds: string[];
  rankedIds: string[];
  requiredComplete: boolean;
};

const PRIORITY_SCORE = { high: 3, medium: 2, low: 1 } as const;

function clampScore(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasCorpusFact(corpus: string, semanticIntent: string, question = ""): boolean {
  const blob = `${semanticIntent} ${question}`.toLowerCase();
  if (/\bgoverning|venue|jurisdiction\b/.test(blob)) return /\b(?:oklahoma|texas|delaware|california|new york)\s+law\b/i.test(corpus);
  if (/\bpayment|fee|milestone|compensation\b/.test(blob)) return /\$[\d,]+|\b\d{1,3}\s*%\b/i.test(corpus);
  if (/\bownership|work product|deliverable|ip\b/.test(blob)) return /\b(?:own|ownership|work product|deliverables?|pre-existing|background)\b/i.test(corpus);
  if (/\bconfidential/.test(blob)) return /\bconfidential/i.test(corpus);
  if (/\btermination|notice\b/.test(blob)) return /\b\d{1,3}\s*[- ]?days?\b[\s\S]{0,80}\bnotice\b|\btermination\b/i.test(corpus);
  if (/\bnotices?\b/.test(blob)) return /\bnotices?\b[\s\S]{0,160}\b(?:email|mail|courier|address|delivery)\b/i.test(corpus);
  return false;
}

function opportunityToVariable(
  opportunity: ProAgreementIntelligencePacket["refinementOpportunities"][number],
): DealVariable {
  const optionalType: GuidedQuestionType = opportunity.type;
  return {
    id: `pro_intel_${opportunity.id}`,
    category: "general",
    label: opportunity.semanticIntent,
    question: opportunity.question,
    severity: opportunity.priority === "high" ? "important" : "optional",
    suggestedDefaults: opportunity.suggestedAnswer
      ? [{ id: "suggested", label: opportunity.suggestedAnswer, value: opportunity.suggestedAnswer }]
      : [],
    agreementImpact: opportunity.reason,
    requiredForExecution: false,
    applicableAgreementFamilies: ["services_agreement"],
    uiControlType: opportunity.suggestedAnswer ? "pills" : "text",
    currentValue: null,
    confidence: PRIORITY_SCORE[opportunity.priority] / 3,
    affectsSections: opportunity.ownerSection ? [opportunity.ownerSection] : [],
    questionType: optionalType,
    semanticIntent: opportunity.semanticIntent,
  };
}

export function adaptPremiumFullDraftToProIntelligencePacket(
  result: PremiumFullDraftResult,
): ProAgreementIntelligencePacket {
  const packet = (result as PremiumFullDraftResult & { pro_intelligence_packet?: Partial<ProAgreementIntelligencePacket> })
    .pro_intelligence_packet;
  const draftText = (packet?.draftText || result.document_text || result.server_full_document_text || "").trim();
  const semanticFacts = packet?.semanticFacts ?? {};
  const adapted = {
    draftText,
    semanticFacts,
    refinementOpportunities: Array.isArray(packet?.refinementOpportunities) ? packet!.refinementOpportunities! : [],
    riskSpots: Array.isArray(packet?.riskSpots) ? packet!.riskSpots! : [],
    confidence: {
      draftCompleteness: clampScore(packet?.confidence?.draftCompleteness ?? (draftText ? 80 : 0)),
      commercialSpecificity: clampScore(packet?.confidence?.commercialSpecificity ?? (result.key_terms_found?.length ? 75 : 0)),
      legalCoherence: clampScore(packet?.confidence?.legalCoherence ?? (draftText ? 75 : 0)),
    },
  };
  logProIntelligencePacketReceived(adapted);
  return adapted;
}

export function recomputeGuidedQuestionsFromAuthoritativeCorpus(args: {
  packet?: ProAgreementIntelligencePacket | null;
  intakeText?: string | null;
  corpusText: string;
  maxOptionalQuestions?: number;
}): GovernedProQuestions {
  const intake = args.intakeText ?? "";
  const corpus = args.corpusText;
  const confidence = validateProAgreementConfidenceGate(corpus, { intakeText: intake });
  const required = confidence.ok ? [] : extractDealVariables({ intakeRaw: intake, body: corpus });
  const variables: DealVariable[] = required.map((v) => ({
    ...v,
    questionType: "REQUIRED_COMPLETION",
    semanticIntent: v.semanticIntent ?? v.id,
    requiredForExecution: true,
  }));

  const seenIntent = new Set(variables.map((v) => normalize(v.semanticIntent ?? v.id)));
  const prunedIds: string[] = [];
  const opportunities = [...(args.packet?.refinementOpportunities ?? [])]
    .filter((o) => o.type !== "CLARIFICATION" || o.priority !== "low")
    .sort((a, b) => PRIORITY_SCORE[b.priority] - PRIORITY_SCORE[a.priority]);

  const optionalLimit = args.maxOptionalQuestions ?? 2;
  for (const opportunity of opportunities) {
    const intent = normalize(opportunity.semanticIntent);
    if (!intent || seenIntent.has(intent)) {
      prunedIds.push(opportunity.id);
      continue;
    }
    if (hasCorpusFact(`${intake}\n${corpus}`, opportunity.semanticIntent, opportunity.question)) {
      prunedIds.push(opportunity.id);
      continue;
    }
    if (variables.filter((v) => v.questionType !== "REQUIRED_COMPLETION").length >= optionalLimit) {
      prunedIds.push(opportunity.id);
      continue;
    }
    seenIntent.add(intent);
    variables.push(opportunityToVariable(opportunity));
  }

  logProIntelligencePacketReceived(args.packet);
  logGuidedSemanticRecompute({ requiredCount: required.length, optionalCount: variables.length - required.length });
  if (prunedIds.length) logGuidedQuestionPruned({ ids: prunedIds });
  logGuidedQuestionRanked({ ids: variables.map((v) => v.id) });
  for (const v of variables.filter((item) => item.questionType !== "REQUIRED_COMPLETION")) {
    logGuidedQuestionOptional({ id: v.id, type: v.questionType ?? "OPTIONAL_ENHANCEMENT" });
  }
  if (required.length === 0) logGuidedRequiredComplete({ corpusLen: corpus.length });

  return {
    variables,
    prunedIds,
    rankedIds: variables.map((v) => v.id),
    requiredComplete: required.length === 0,
  };
}

export function logProIntelligencePacketReceived(packet?: ProAgreementIntelligencePacket | null): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-intelligence-packet-received]", {
    hasPacket: Boolean(packet),
    opportunities: packet?.refinementOpportunities.length ?? 0,
    risks: packet?.riskSpots.length ?? 0,
  });
}

export function logGuidedSemanticRecompute(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-semantic-recompute]", payload);
}

export function logGuidedQuestionPruned(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-pruned]", payload);
}

export function logGuidedQuestionRanked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-ranked]", payload);
}

export function logGuidedQuestionOptional(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-optional]", payload);
}

export function logGuidedRequiredComplete(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-required-complete]", payload);
}
