import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  finalizeGuidedProAgreementCorpus,
  validateFinalGuidedProCorpusBeforeFreeze,
  describeGuidedValidationMissingItems,
} from "./guidedFinalCorpusFinalizer";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import { buildCanonicalGuidedAnswerManifest } from "./guidedCanonicalAnswerManifest";
import { buildCanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import type { GuidedCompletionSession } from "./types";
import {
  resolveGuidedFinalizeModalBlockedPresentation,
  describeGuidedFinalizeValidationBlock,
} from "./guidedSignerSetupToFinalReview";
import { buildAutoSignaturePacketForAllRoles } from "../../../vs01/vs01AutoSignaturePacket";
import { buildVs01PrepareSigningRoles } from "../../../vs01/vs01SignerFieldAssignment";

const identities: CanonicalPartyIdentity[] = [
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
    email: "joe345@gmail.com",
    representativeName: null,
    title: null,
    blockHeading: "SERVICE PROVIDER",
    isIndividual: true,
  },
];

function test42Session(): GuidedCompletionSession {
  const ids = [
    "project_fee_phase_confirmation",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test42",
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
      project_fee_phase_confirmation: "$120k even across phases",
      phase_payment_allocation: "Even thirds across phases",
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

function bodyMissingGuidedSections(): string {
  return (
    `
AI Automation Services Agreement

1. Scope of Services
Provider will deliver automation services.

2. Fees and Payment
Company will pay fees as described in Schedule A.

3. Confidentiality
Each party will protect confidential information.

6. Term and Termination
The term continues until terminated.

7. General Terms
Electronic Signatures are permitted.

IN WITNESS WHEREOF, the parties execute below.

CLIENT:
[Your Company Name]
By: __________________________
Name: ______
Title: ______
Date: _________________________

SERVICE PROVIDER:
[Service Provider Name]
By: __________________________
Name: ______
Date: _________________________
`.trim() +
    "\n\n" +
    "Commercial safeguard paragraph. ".repeat(130)
  );
}

describe("guided Pro final review test42 regression", () => {
  it("canonical manifest does not require Net 30 for $120k even across phases answer set", () => {
    const manifest = buildCanonicalGuidedAnswerManifest(test42Session());
    expect(manifest.entries.some((e) => e.variableId === "payment_timing")).toBe(false);
    const paymentEntry = manifest.entries.find((e) => e.variableId === "project_fee_phase_confirmation");
    expect(paymentEntry?.selectedAnswerText).toBe("$120k even across phases");
    expect(paymentEntry?.validationPatterns.some((p) => p.test("Net 30"))).toBe(false);
    expect(paymentEntry?.validationPatterns.some((p) => p.test("$120,000"))).toBe(true);
  });

  it("validation passes after merge without Net 30 in corpus", () => {
    const merged = mergeAllGuidedAnswersIntoCorpus(bodyMissingGuidedSections(), test42Session());
    expect(merged.body).not.toMatch(/\bNet\s*30\b/i);
    expect(merged.body).toMatch(/\$?\s*120[\s,]*000|\b120\s*k\b/i);
    expect(merged.body).toMatch(/even\s+thirds|evenly\s+across\s+build/i);
    expect(merged.body).toMatch(/\b99\.9\s*%/i);
    expect(merged.body).toMatch(/\bCompany owns the project deliverables\b/i);
    expect(merged.body).toMatch(/\b30\s+days?.{0,30}notice\b/i);

    const validation = validateFinalGuidedProCorpusBeforeFreeze({
      body: merged.body,
      guidedSession: test42Session(),
    });
    expect(validation.ok).toBe(true);
    expect(validation.missing).toEqual([]);
  });

  it("describeGuidedValidationMissingItems never mentions Net 30 for test42 answers", () => {
    const incomplete = bodyMissingGuidedSections();
    const validation = validateFinalGuidedProCorpusBeforeFreeze({
      body: incomplete,
      guidedSession: test42Session(),
    });
    const detail = describeGuidedValidationMissingItems(validation.missing, test42Session()).join(" ");
    expect(detail).not.toMatch(/Net\s*30\s+payment\s+terms/i);
  });

  it("finalizer succeeds with test42 answers, Acme/Joe signatures, and VS01 packet", () => {
    const working = mergeAllGuidedAnswersIntoCorpus(bodyMissingGuidedSections(), test42Session()).body;
    const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: working, paid: true }],
      guidedSession: test42Session(),
      signerIdentities: identities,
      signerManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.validationMissing).toEqual([]);
    expect(result.body).not.toMatch(/\bNet\s*30\b/i);
    expect(result.body).toMatch(/\$?\s*120[\s,]*000|\b120\s*k\b/i);
    expect(result.body).toMatch(/even\s+thirds|evenly\s+across\s+build|one[-\s]?third/i);
    expect(result.body).toMatch(/\b99\.9\s*%/i);
    expect(result.body).toMatch(/\bClient owns the project deliverables\b/i);
    expect(result.body).toMatch(/\b30\s+days?.{0,30}notice\b/i);
    expect(result.body).toMatch(/CLIENT:\s*\nAcme LLC[\s\S]*Name: Anthem H Blanchard[\s\S]*Title: Manager/i);
    expect(result.body).toMatch(/SERVICE PROVIDER:\s*\nJoe Smith[\s\S]*Name: Joe Smith/i);

    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_test42",
      creatorName: "Acme LLC",
      creatorEmail: "anthemhayek@gmail.com",
      ownerSignerName: "Anthem H Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe345@gmail.com" }],
    });
    const packet = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: {
        typedName: "Anthem H Blanchard",
        initials: "AB",
        signerEmail: "anthemhayek@gmail.com",
      },
      corpusText: result.body,
    });
    expect(packet.placedCount).toBeGreaterThan(0);
  });

  it("modal keeps validation stabilization invisible and neutral", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "guided_validation_incomplete",
      workingDraftLen: 900,
      validationMissing: ["project_fee_phase_confirmation"],
    });
    expect(modal.headline).toBe("Optimizing agreement structure.");
    expect(modal.body).not.toMatch(/Net\s*30/i);
    expect(modal.body).not.toMatch(/could not finish|another pass|retry final review/i);
    expect(modal.ctaLabel).toBeNull();
  });

  it("intake wires retry final review logs and finalizer re-run", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    const retryLogs = readFileSync(join(__dirname, "guidedSignerSetupToFinalReview.ts"), "utf8");
    expect(retryLogs).toContain("[guided-final-review-retry-start]");
    expect(retryLogs).toContain("[guided-final-review-retry-answers]");
    expect(retryLogs).toContain("[guided-final-review-retry-success]");
    expect(retryLogs).toContain("[guided-final-review-retry-failed]");
    expect(intake).toContain("buildCanonicalGuidedAnswerManifest");
    expect(intake).toContain("guidedFinalReviewRetryPendingRef");
    expect(intake).toContain("logGuidedFinalReviewRetryStart");
    const modalIdx = intake.indexOf("onRetryFinalReview");
    const modalBlock = intake.slice(modalIdx, modalIdx + 900);
    expect(modalBlock).toContain("continueGuidedSignerSetupToFinalReview");
    expect(modalBlock).toContain("logGuidedFinalReviewRetryStart");
    expect(modalBlock).not.toContain("scrollGuidedSignerSetupIntoView");
  });

  it("describeGuidedFinalizeValidationBlock uses answer-aware missing labels", () => {
    const detail = describeGuidedFinalizeValidationBlock({
      validationMissing: ["project_fee_phase_confirmation"],
      guidedSession: test42Session(),
    });
    expect(detail).toMatch(/\$120k even across phases/i);
    expect(detail).not.toMatch(/Net\s*30\s+payment\s+terms/i);
  });
});
