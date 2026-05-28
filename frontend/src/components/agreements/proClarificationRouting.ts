import type {
  AgreementIntelligence,
  AgreementValidationResult,
  RecommendedQuestion,
} from "./premiumFullDraftApi";
import type { DealVariable, GuidedQuestionType } from "./guidedDealCompletion/types";

export type ProIntelligenceClarificationRoutingContext = {
  agreementIntelligence?: AgreementIntelligence | null;
  agreementValidation?: AgreementValidationResult | null;
};

export function hasCredibleAgreementValidation(
  validation: AgreementValidationResult | null | undefined,
): validation is AgreementValidationResult {
  if (!validation || typeof validation.passed !== "boolean") return false;
  if (!validation.passed) {
    return Array.isArray(validation.failures) && validation.failures.length > 0;
  }
  return Boolean(validation.summary?.checked_at?.trim());
}

function hasCredibleAgreementIntelligence(
  intelligence: AgreementIntelligence | null | undefined,
): intelligence is AgreementIntelligence {
  if (!intelligence?.extracted_terms) return false;
  const terms = intelligence.extracted_terms;
  if ((terms.parties?.length ?? 0) > 0) return true;
  if ((intelligence.recommended_questions?.length ?? 0) > 0) return true;
  if ((intelligence.ambiguities?.length ?? 0) > 0) return true;
  if ((intelligence.conflicts?.length ?? 0) > 0) return true;
  if ((intelligence.missing_material_terms?.length ?? 0) > 0) return true;
  if ((intelligence.quality_flags?.length ?? 0) > 0) return true;
  if (terms.governing_law?.trim()) return true;
  if (terms.payment_terms != null) return true;
  if (terms.ownership_terms != null) return true;
  if (terms.termination_terms != null) return true;
  if (terms.confidentiality != null) return true;
  if (terms.notices != null) return true;
  if (terms.support_terms != null) return true;
  if (terms.third_party_dependency_terms != null) return true;
  if (terms.electronic_signatures != null) return true;
  return false;
}

/** Premium Pro clarification routing — only when API intelligence and/or validation are present. */
export function shouldUseProIntelligenceClarificationRouting(
  context: ProIntelligenceClarificationRoutingContext,
): boolean {
  return (
    hasCredibleAgreementValidation(context.agreementValidation) ||
    hasCredibleAgreementIntelligence(context.agreementIntelligence)
  );
}

export type ProClarificationRoutingState =
  | {
      mode: "no_questions";
      message: "No additional clarification needed.";
      questions: DealVariable[];
      skippedStaticFallback: true;
    }
  | {
      mode: "material_questions";
      questions: DealVariable[];
      skippedStaticFallback: true;
    }
  | {
      mode: "validation_repair_needed";
      message: "This draft needs a quality pass before signing.";
      questions: DealVariable[];
      failureCodes: string[];
      skippedStaticFallback: true;
    }
  | {
      mode: "legacy_static_fallback_allowed";
      questions: DealVariable[];
      skippedStaticFallback: false;
    };

const PRIORITY_SCORE = { high: 3, medium: 2, low: 1 } as const;

function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function categoryForTopic(topic: string): DealVariable["category"] {
  const t = norm(topic);
  if (/\bgoverning|venue|jurisdiction|law\b/.test(t)) return "governing_law";
  if (/\bsupport|renewal\b/.test(t)) return "support";
  if (/\bpayment|fee|milestone|invoice|net\b/.test(t)) return "payment_timing";
  if (/\bownership|work product|ip\b/.test(t)) return "ip_ownership";
  if (/\bnotice\b/.test(t)) return "notices";
  if (/\btermination|cure\b/.test(t)) return "termination";
  if (/\bconfidential\b/.test(t)) return "confidentiality";
  if (/\buptime|third[- ]party|dependency\b/.test(t)) return "uptime";
  return "general";
}

function typeForReason(reason: string, topic: string): GuidedQuestionType {
  const blob = norm(`${reason} ${topic}`);
  if (/\bconflict|contradict|inconsistent\b/.test(blob)) return "CLARIFICATION";
  if (/\bmissing|not stated|absent\b/.test(blob)) return "REQUIRED_COMPLETION";
  if (/\bambiguous|unclear|clarif/.test(blob)) return "CLARIFICATION";
  return "OPTIMIZATION";
}

function suppliedGoverningLaw(intelligence?: AgreementIntelligence | null, intakeText?: string | null): string {
  const extracted = intelligence?.extracted_terms?.governing_law?.trim();
  if (extracted) return extracted;
  const intake = intakeText ?? "";
  const m =
    intake.match(/\b([A-Z][a-z]+)\s+(?:governing\s+)?law\b/) ??
    intake.match(/\bgoverned\s+by\s+([A-Z][a-z]+)\b/);
  return m?.[1] ?? "";
}

function questionTouchesSuppliedGoverningLaw(
  q: RecommendedQuestion,
  intelligence?: AgreementIntelligence | null,
  intakeText?: string | null,
): boolean {
  const topic = norm(`${q.topic} ${q.question}`);
  return /\bgoverning|venue|jurisdiction|law\b/.test(topic) && Boolean(suppliedGoverningLaw(intelligence, intakeText));
}

function isGenericQuestionAboutSuppliedTerm(
  q: RecommendedQuestion,
  intelligence?: AgreementIntelligence | null,
  intakeText?: string | null,
): boolean {
  if (!questionTouchesSuppliedGoverningLaw(q, intelligence, intakeText)) return false;
  const blob = norm(`${q.reason} ${q.question}`);
  return !/\bchange|conflict|contradict|inconsistent|different|mismatch\b/.test(blob);
}

function maybeWithChangeConfirmation(
  q: RecommendedQuestion,
  intelligence?: AgreementIntelligence | null,
  intakeText?: string | null,
): RecommendedQuestion {
  const law = suppliedGoverningLaw(intelligence, intakeText);
  if (!law || !questionTouchesSuppliedGoverningLaw(q, intelligence, intakeText)) return q;
  if (/\bchange|previously provided|already provided\b/i.test(q.question)) return q;
  return {
    ...q,
    question: `You previously provided ${law} governing law. Do you want to change it?`,
    reason: q.reason || "This would change a term already extracted from the intake.",
  };
}

function recommendedQuestionToVariable(q: RecommendedQuestion): DealVariable {
  const priorityScore = PRIORITY_SCORE[q.priority] ?? 2;
  return {
    id: `agreement_intelligence_${q.id || q.topic.replace(/\W+/g, "_").toLowerCase()}`,
    category: categoryForTopic(q.topic),
    label: q.topic || "Clarification",
    question: q.question,
    severity: q.priority === "high" ? "important" : "optional",
    suggestedDefaults: [],
    agreementImpact: q.reason,
    requiredForExecution: q.priority === "high",
    applicableAgreementFamilies: ["generic_business_agreement"],
    uiControlType: "text",
    currentValue: null,
    confidence: priorityScore / 3,
    affectsSections: q.topic ? [q.topic] : [],
    questionType: typeForReason(q.reason, q.topic),
    semanticIntent: q.topic || q.id,
  };
}

export function resolveProClarificationRouting(args: {
  agreementIntelligence?: AgreementIntelligence | null;
  agreementValidation?: AgreementValidationResult | null;
  intakeText?: string | null;
  allowLegacyFallback?: boolean;
}): ProClarificationRoutingState {
  if (
    !shouldUseProIntelligenceClarificationRouting({
      agreementIntelligence: args.agreementIntelligence,
      agreementValidation: args.agreementValidation,
    })
  ) {
    return {
      mode: "legacy_static_fallback_allowed",
      questions: [],
      skippedStaticFallback: false,
    };
  }

  const validation = hasCredibleAgreementValidation(args.agreementValidation)
    ? args.agreementValidation
    : null;
  const intelligence = hasCredibleAgreementIntelligence(args.agreementIntelligence)
    ? args.agreementIntelligence
    : null;

  if (validation && !validation.passed) {
    const failureCodes = validation.failures.map((f) => f.code);
    return {
      mode: "validation_repair_needed",
      message: "This draft needs a quality pass before signing.",
      questions: [],
      failureCodes,
      skippedStaticFallback: true,
    };
  }

  if (validation?.passed === true && intelligence) {
    const material = (intelligence.recommended_questions ?? [])
      .filter((q) => q.question.trim().length > 8)
      .filter((q) => !isGenericQuestionAboutSuppliedTerm(q, intelligence, args.intakeText))
      .map((q) => maybeWithChangeConfirmation(q, intelligence, args.intakeText))
      .sort((a, b) => (PRIORITY_SCORE[b.priority] ?? 2) - (PRIORITY_SCORE[a.priority] ?? 2))
      .slice(0, 3)
      .map(recommendedQuestionToVariable);

    if (!material.length) {
      return {
        mode: "no_questions",
        message: "No additional clarification needed.",
        questions: [],
        skippedStaticFallback: true,
      };
    }

    return {
      mode: "material_questions",
      questions: material,
      skippedStaticFallback: true,
    };
  }

  return {
    mode: "legacy_static_fallback_allowed",
    questions: [],
    skippedStaticFallback: false,
  };
}

export function logProClarificationRoutingState(state: ProClarificationRoutingState): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-clarification-routing]", {
    mode: state.mode,
    questionCount: state.questions.length,
    skippedStaticFallback: state.skippedStaticFallback,
    failureCodes: state.mode === "validation_repair_needed" ? state.failureCodes.slice(0, 8) : [],
  });
}
