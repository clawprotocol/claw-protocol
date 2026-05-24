import { describe, expect, it } from "vitest";
import {
  finalizeGuidedProAgreementCorpus,
  validateFinalGuidedProCorpusBeforeFreeze,
} from "./guidedFinalCorpusFinalizer";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import { normalizeGuidedProCorpusStructure } from "./guidedCanonicalCorpusNormalizer";
import { test52CorruptedPostAnswerCorpus } from "./guidedCorpusLineRepairs.test";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";
import { corpusIntegrityFromStructureDefects } from "../paymentFlowProgression";

const TEST52_IDENTITIES: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthemhayek@gmail.com",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "jms7879@me.com",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

function test52Session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test52-payment",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered: {
      payment_timing: "Net 30",
      phase_payment_allocation: "Build-heavy split",
      saas_sla: "99.9% uptime",
      ip_ownership: "Company owns project deliverables",
      renewal_notice: "30 days notice",
    },
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: ids.length,
  };
}

describe("guided payment progression — test52 flow", () => {
  it("finalizes authoritative corpus after payment path normalization (test52)", () => {
    const session = test52Session();
    const merged = mergeAllGuidedAnswersIntoCorpus(test52CorruptedPostAnswerCorpus(), session);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: merged.body, paid: true }],
      guidedSession: session,
      signerIdentities: TEST52_IDENTITIES,
      signerManifest: null,
      originalIntake:
        "hey need an agreement for somebody helping us with AI automation setup workflows and dashboards",
    });
    expect(result.ok).toBe(true);
    expect(validateFinalGuidedProCorpusBeforeFreeze({ body: result.body, guidedSession: session }).ok).toBe(true);
  });

  it("structure defects are warnings only and do not fail finalize when semantic validation passes", () => {
    const session = test52Session();
    const body = normalizeGuidedProCorpusStructure(test52CorruptedPostAnswerCorpus()).text;
    const merged = mergeAllGuidedAnswersIntoCorpus(body, session);
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium", body: merged.body, paid: true }],
      guidedSession: session,
      signerIdentities: TEST52_IDENTITIES,
      signerManifest: null,
      originalIntake: "AI automation setup agreement",
    });
    expect(result.ok).toBe(true);
    if (result.diagnostics.structureDefects.length > 0) {
      expect(corpusIntegrityFromStructureDefects(result.diagnostics.structureDefects)).toBe("warn");
      expect(result.diagnostics.validationContradictions.some((c) => c.startsWith("corpus_structure:"))).toBe(
        false,
      );
    }
  });
});
