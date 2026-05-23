import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  finalizeGuidedProAgreementCorpus,
  validateFinalGuidedProCorpusBeforeFreeze,
} from "./guidedFinalCorpusFinalizer";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
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
    email: "anthem@example.test",
    representativeName: "Anthem Blanchard",
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
    sessionKey: "gen:test41",
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

/** Pro body missing sections 4/5 — reproduces test41 skipped_no_anchor + validation block. */
function bodyMissingOwnershipAndSupportSections(): string {
  return (
    `
AI Automation Services Agreement

1. Scope of Services
Provider will deliver automation services.

2. Fees and Payment
Company will pay monthly fees.

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

describe("guided Pro final review test41 regression", () => {
  it("creates missing ownership/support sections instead of skipped_no_anchor", () => {
    const merged = mergeAllGuidedAnswersIntoCorpus(bodyMissingOwnershipAndSupportSections(), session());
    expect(merged.merges.some((m) => m.questionId === "saas_sla" && m.action === "created_section")).toBe(true);
    expect(merged.merges.some((m) => m.questionId === "ip_ownership" && m.action === "created_section")).toBe(true);
    expect(merged.merges.every((m) => m.action !== "skipped_no_anchor")).toBe(true);
    expect(merged.body).toMatch(/\b99\.9\s*%/i);
    expect(merged.body).toMatch(/\bCompany owns the project deliverables\b/i);
    const witness = merged.body.search(/IN WITNESS WHEREOF/i);
    expect(witness).toBeGreaterThan(merged.body.search(/\b99\.9\s*%/i));
  });

  it("finalizer succeeds for canonical working draft without placeholders", () => {
    const working = mergeAllGuidedAnswersIntoCorpus(bodyMissingOwnershipAndSupportSections(), session()).body;
    const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: working, paid: true }],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(result.ok).toBe(true);
    expect(result.unresolvedPlaceholders).toEqual([]);
    expect(result.diagnostics.validationMissing).toEqual([]);
    expect(result.body).toMatch(/\bNet 30\b/i);
    expect(result.body).toMatch(/\bbuild-heavy\b/i);
    expect(result.body).toMatch(/\b99\.9\s*%/i);
    expect(result.body).toMatch(/\bCompany owns the project deliverables\b/i);
    expect(result.body).toMatch(/\b30\s+days?.{0,30}notice\b/i);
    expect(result.body).not.toMatch(/\[Your Company Name\]|\[Service Provider Name\]/i);
    expect(result.body).toMatch(/CLIENT:\s*\nAcme LLC[\s\S]*Name: Anthem Blanchard[\s\S]*Title: Manager/i);
    expect(result.body).toMatch(/SERVICE PROVIDER:\s*\nJoe Smith[\s\S]*Name: Joe Smith/i);
  });

  it("guided_validation_incomplete with empty placeholders includes structured missing reasons", () => {
    const incompleteBody = bodyMissingOwnershipAndSupportSections();
    const validation = validateFinalGuidedProCorpusBeforeFreeze({
      body: incompleteBody,
      guidedSession: session(),
    });
    expect(validation.ok).toBe(false);
    expect(validation.missing.length).toBeGreaterThan(0);
    const detail = describeGuidedFinalizeValidationBlock({
      validationMissing: validation.missing,
      guidedSession: session(),
    });
    expect(detail).toBeTruthy();
    expect(detail).toMatch(/99\.9%|SLA|uptime/i);
  });

  it("modal uses preparing copy without Try again when working draft exists and no validation detail", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "guided_validation_incomplete",
      workingDraftLen: 2982,
    });
    expect(modal.headline).toBe("Preparing final review.");
    expect(modal.ctaLabel).toBeNull();
    expect(modal.headline).not.toBe("Needs your attention");
  });

  it("modal retry CTA is Retry final review, not Try again", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "guided_validation_incomplete",
      workingDraftLen: 900,
      validationMissing: ["saas_sla", "ip_ownership"],
    });
    expect(modal.ctaLabel).toBe("Retry final review");
    expect(modal.ctaLabel).not.toBe("Try again");
    expect(modal.kind).toBe("internal_retry");
  });

  it("intake wires retry final review to continueGuidedSignerSetupToFinalReview", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("onRetryFinalReview");
    expect(intake).toContain('void continueGuidedSignerSetupToFinalReview("sticky_cta")');
    expect(intake).toContain('setCreateFlowPhase("finalizing_final_review")');
    const modalIdx = intake.indexOf("onRetryFinalReview");
    const modalBlock = intake.slice(modalIdx, modalIdx + 900);
    expect(modalBlock).toContain("continueGuidedSignerSetupToFinalReview");
    expect(modalBlock).toContain("logGuidedFinalReviewRetryStart");
    expect(modalBlock).not.toContain("scrollGuidedSignerSetupIntoView");
  });

  it("full guided Pro corpus reaches VS01 auto signature packet with correct signer cards", () => {
    const working = mergeAllGuidedAnswersIntoCorpus(bodyMissingOwnershipAndSupportSections(), session()).body;
    const manifest = buildCanonicalSignerManifest({ identities, signFirst: true });
    const finalized = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "canonical_working_draft", body: working, paid: true }],
      guidedSession: session(),
      signerIdentities: identities,
      signerManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(finalized.ok).toBe(true);
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_test41",
      creatorName: "Acme LLC",
      creatorEmail: "anthem@example.test",
      ownerSignerName: "Anthem Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test" }],
    });
    const packet = buildAutoSignaturePacketForAllRoles({
      roles,
      pageCount: 2,
      existingFields: [],
      ownerValueCtx: {
        typedName: "Anthem Blanchard",
        initials: "AB",
        signerEmail: "anthem@example.test",
      },
      corpusText: finalized.body,
    });
    expect(packet.placedCount).toBeGreaterThan(0);
    const sigs = packet.fields.filter((f) => f.type === "signature");
    expect(sigs.length).toBe(2);
    expect(finalized.body).toMatch(/CLIENT:\s*\nAcme LLC[\s\S]*Name: Anthem Blanchard[\s\S]*Title: Manager/i);
    expect(finalized.body).toMatch(/SERVICE PROVIDER:\s*\nJoe Smith[\s\S]*Name: Joe Smith/i);
  });
});
