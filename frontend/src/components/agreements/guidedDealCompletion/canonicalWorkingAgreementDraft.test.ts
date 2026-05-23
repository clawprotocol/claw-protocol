import { describe, expect, it } from "vitest";
import {
  pickCanonicalWorkingAgreementDraft,
  prepareCanonicalWorkingDraftForFinalization,
  isCanonicalWorkingDraftReadyForFinalization,
  CANONICAL_WORKING_DRAFT_SOURCE,
} from "./canonicalWorkingAgreementDraft";
import {
  finalizeGuidedProAgreementCorpus,
  validateFinalGuidedProCorpusBeforeFreeze,
} from "./guidedFinalCorpusFinalizer";
import { buildCanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";
import {
  evaluateGuidedSignerSetupContinueReadiness,
  resolveGuidedFinalizeModalBlockedPresentation,
} from "./guidedSignerSetupToFinalReview";

const identities: CanonicalPartyIdentity[] = [
  {
    index: 0,
    partyDisplayName: "Acme LLC",
    email: "anthem@example.test",
    representativeName: "Anthem H Blanchard",
    title: "Manager",
    blockHeading: "CLIENT",
    isIndividual: false,
  },
  {
    index: 1,
    partyDisplayName: "Joe Smith",
    email: "joe@example.test",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

function session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test40",
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

function paidBody(extra = ""): string {
  return `
AI Automation Services Agreement

1. Scope of Services
Provider will deliver automation services.

2. Fees and Payment
Company will pay monthly fees.

3. Confidentiality
Each party will protect confidential information.

4. Ownership and Work Product
Ownership will be as stated in this Agreement.

5. Support and Service Levels
Provider will provide commercially reasonable support.

6. Term and Termination
The term continues until terminated.

7. General Terms
Electronic Signatures are permitted.

${extra}
`.trim() + "\n\n" + "Commercial safeguard paragraph. ".repeat(130);
}

describe("canonicalWorkingAgreementDraft (test40)", () => {
  it("picks longest progressive working draft candidate", () => {
    const picked = pickCanonicalWorkingAgreementDraft(["short", paidBody(), "medium length text ".repeat(40)]);
    expect(picked.source).toBe(CANONICAL_WORKING_DRAFT_SOURCE);
    expect(picked.len).toBeGreaterThan(1500);
  });

  it("prepares working draft with section-aware merges", () => {
    const prepared = prepareCanonicalWorkingDraftForFinalization({
      body: paidBody(),
      guidedSession: session(),
    });
    expect(validateFinalGuidedProCorpusBeforeFreeze({ body: prepared.body, guidedSession: session() }).ok).toBe(
      true,
    );
  });

  it("finalizer accepts canonical working draft when guided answers and signers are complete", () => {
    const working = prepareCanonicalWorkingDraftForFinalization({
      body: paidBody(),
      guidedSession: session(),
    }).body;
    const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: working, paid: true }],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.selectedSource).toBe("canonical_working_draft");
    expect(result.body).toMatch(/\bNet 30\b/i);
    expect(result.body).toMatch(/\bbuild-heavy\b/i);
    expect(result.body).toMatch(/CLIENT:\s*\nAcme LLC[\s\S]*Name: Anthem H Blanchard[\s\S]*Title: Manager/i);
    expect(result.body).toMatch(/SERVICE PROVIDER:\s*\nJoe Smith[\s\S]*Name: Joe Smith/i);
    const witness = result.body.search(/IN WITNESS WHEREOF/i);
    expect(witness).toBeGreaterThan(result.body.search(/\bNet 30\b/i));
  });

  it("does not block continue readiness when canonical working draft len is available", () => {
    expect(
      evaluateGuidedSignerSetupContinueReadiness({
        applyStatus: "idle",
        signersComplete: true,
        authoritativeBodyLen: 0,
        canonicalWorkingDraftLen: 2796,
      }).ok,
    ).toBe(true);
  });

  it("uses preparing copy instead of Needs your attention when working draft exists", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "authoritative_body_missing",
      workingDraftLen: 2796,
    });
    expect(modal.headline).toBe("Preparing final review.");
    expect(modal.headline).not.toBe("Needs your attention");
    expect(modal.ctaLabel).toBeNull();
  });

  it("uses signer-specific modal copy when signers incomplete", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "signers_incomplete",
      workingDraftLen: 2796,
    });
    expect(modal.headline).toBe("Signer details needed.");
    expect(modal.ctaLabel).toBe("Edit signer details");
  });

  it("reports ready for finalization when session + signers + len satisfied", () => {
    expect(
      isCanonicalWorkingDraftReadyForFinalization({
        bodyLen: 2796,
        guidedSession: session(),
        signersComplete: true,
      }),
    ).toBe(true);
  });
});
