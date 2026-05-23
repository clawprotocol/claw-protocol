import { describe, expect, it } from "vitest";
import {
  finalizeGuidedProAgreementCorpus,
  validateFinalGuidedProCorpusBeforeFreeze,
} from "./guidedFinalCorpusFinalizer";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import { normalizeGuidedProCorpusStructure, validateNormalizedCorpusStructure } from "./guidedCanonicalCorpusNormalizer";
import { test52CorruptedPostAnswerCorpus } from "./guidedCorpusLineRepairs.test";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";
import { buildSendRouteReadonlyHtmlFromPlain } from "../sendHandoffAuthoritativeCorpus";

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
    sessionKey: "gen:test52",
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

describe("guided final review test52 — regression fixture", () => {
  it("normalizes corrupted post-answer corpus from smoke path", () => {
    const normalized = normalizeGuidedProCorpusStructure(test52CorruptedPostAnswerCorpus());
    const structure = validateNormalizedCorpusStructure(normalized.text);
    expect(structure.ok, structure.defects.join(", ")).toBe(true);
    expect(normalized.text).not.toMatch(/^[^\n]*\b6\.1\b[^\n]*\b8\.1\b[^\n]*$/im);
    expect(normalized.text).toMatch(/By:\s*_{2,}/i);
    expect(normalized.text).toMatch(/Signature:\s*_{2,}/i);
  });

  it("finalizes guided Pro corpus with canonical sections and signers", () => {
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
    expect(
      result.ok,
      JSON.stringify({
        missing: result.diagnostics.validationMissing,
        contradictions: result.diagnostics.validationContradictions,
        structure: result.diagnostics.structureDefects,
        len: result.diagnostics.selectedLen,
      }),
    ).toBe(true);
    expect(result.diagnostics.structureDefects).toEqual([]);
    const body = result.body;
    expect(body).toMatch(/CLIENT:\s*\n\s*Acme LLC/i);
    expect(body).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(body).toMatch(/SERVICE PROVIDER:\s*\n\s*Joe Smith/i);
    expect(body).not.toMatch(/Execution and signature placement are handled/i);
    const validation = validateFinalGuidedProCorpusBeforeFreeze({ body, guidedSession: session });
    expect(validation.ok).toBe(true);
  });

  it("does not inject execution-placement footer into signing HTML when By lines exist", () => {
    const body = normalizeGuidedProCorpusStructure(test52CorruptedPostAnswerCorpus()).text;
    const html = buildSendRouteReadonlyHtmlFromPlain(body, { documentLabel: null });
    expect(html).not.toContain("Execution and signature placement are handled");
  });
});
