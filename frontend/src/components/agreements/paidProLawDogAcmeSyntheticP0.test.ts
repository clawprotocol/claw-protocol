/**
 * P0 synthetic staging regression: LawDog Demo LLC / Acme Test Co services agreement.
 * Asserts party-role consistency, numbering hierarchy, heading merge, and draft/signer UI copy.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveStarterTwoPartyCommercialAuthority } from "./canonicalPartyRoleAuthority";
import {
  detectExecutionBlockRoleInversion,
  resolvePaidProPartyRolesFromAcceptedCorpus,
} from "./paidProAcceptedCorpusPartyRoles";
import {
  preparePaidProFrozenDisplayPlain,
  preparePaidProReviewDisplayPlain,
} from "./paidProFlattenedDocumentNormalize";
import { preparePaidProFreezeCandidateText } from "./paidProFreezeCandidate";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import { repairPaidProEmptyParentSectionHierarchy } from "./repairPaidProEmptyParentSectionHierarchy";
import {
  PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL,
  PAID_PRO_REVIEW_BADGE,
  PAID_PRO_REVIEW_CHIP_VERSION,
  resolvePaidProReviewSignerDetailsActionLabel,
} from "./authoritativePaidProReview";
import {
  PAID_PRO_REVIEW_AUTOMATED_DRAFT_CHECKS_LABEL,
  resolvePaidProReviewTrustSteps,
} from "./paidProReviewTrustUx";
import { PREMIUM_PRO_WAIT_TITLE_PROCESSING } from "../../lib/premiumPostCheckoutReturnUx";
import {
  PAID_PRO_PREPARE_ESIGN_DECISION_CTA,
  resolveSignerSetupPartyIdentities,
} from "./signerSetupPartyIdentity";
import { resolvePaidProStickyCta } from "./paidProStickyCta";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

export const LAWDOG_ACME_SYNTHETIC_INTAKE =
  "Create a services agreement between LawDog Demo LLC and Acme Test Co. LawDog Demo LLC will provide agreement-drafting software for $1,000 per month. The term is 30 days. Either party may cancel with 7 days’ written notice. Illinois law applies.";

const LAWDOG = "LawDog Demo LLC";
const ACME = "Acme Test Co";

/** Defective corpus mirroring staging: provider-first opening, inverted signature blocks, orphan parents, split Independent Contractor. */
function buildDefectiveLawDogAcmeCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between ${LAWDOG} ("Service Provider") and ${ACME} ("Client").`,
    "",
    "1. SERVICES AGREEMENT",
    "This Agreement sets forth the terms for the services described below.",
    "2. Services and Access",
    "Provider will provide agreement-drafting software access to Client.",
    "3. Term",
    "The term is thirty (30) days from the Effective Date.",
    "4. Fees and Payment",
    "5. Subscription Fee",
    "5.1 Subscription Fee",
    "Client will pay Provider a subscription fee of $1,000 per month.",
    "5.2 Invoicing and Payment Timing",
    "Provider will invoice Client monthly.",
    "5.3 Taxes",
    "Client is responsible for applicable taxes.",
    "5.4 Disputed Amounts",
    "Client may withhold disputed amounts in good faith.",
    "6. Use Restrictions and Provider Ownership",
    "Client will not reverse engineer the software. Provider retains ownership of the platform.",
    "7. Confidentiality",
    "Each party will protect Confidential Information.",
    "8. Representations, Warranties and Compliance",
    "Each party represents that it has authority to enter into this Agreement.",
    "9. Termination",
    "10. Termination for Convenience",
    "10.1 Termination for Convenience",
    "Either party may terminate this Agreement for any reason by giving at least seven (7) days' written notice to the other party.",
    "10.2 Termination for Material Breach",
    "Either party may terminate for material breach after a seven (7) day cure period.",
    "10.3 Effect of Termination",
    "Upon termination, access ends and undisputed fees remain payable.",
    "11. Liability Allocation",
    "12. Mutual Indemnity for Third-Party Claims",
    "12.1 Mutual Indemnity for Third-Party Claims",
    "Each party will indemnify the other for third-party claims arising from its breach.",
    "12.2 Limitation of Liability",
    "To the fullest extent permitted by law, aggregate liability is limited.",
    "13. General Provisions",
    "14. Independent",
    "Contractor",
    "14.1 Independent Contractor",
    "Provider is an independent contractor and not an employee of Client.",
    "14.2 Assignment",
    "Neither party may assign without consent.",
    "14.3 Force Majeure",
    "Neither party is liable for force majeure delays.",
    "14.4 Notices",
    `If to ${ACME}: ${ACME} provided during signer setup.`,
    `If to ${LAWDOG}: ${LAWDOG} provided during signer setup.`,
    "15. Governing Law",
    "This Agreement shall be governed by the laws of Illinois.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    LAWDOG,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: __________________________",
    "",
    "SERVICE PROVIDER:",
    ACME,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: __________________________",
  ].join("\n");
}

function assertLawDogAcmeRoleAgreement(corpus: string): void {
  expect(corpus).toMatch(
    new RegExp(
      `${LAWDOG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(\\s*["']?Service Provider["']?\\s*\\)`,
      "i",
    ),
  );
  expect(corpus).toMatch(
    new RegExp(
      `${ACME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(\\s*["']?Client["']?\\s*\\)`,
      "i",
    ),
  );
  expect(corpus).toMatch(new RegExp(`If to\\s+${ACME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
  expect(corpus).toMatch(new RegExp(`If to\\s+${LAWDOG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
  const tail = corpus.slice(corpus.search(/\bIN WITNESS WHEREOF\b/i));
  expect(detectExecutionBlockRoleInversion(corpus)).toBe(false);
  expect(tail).toMatch(/CLIENT\s*:\s*(?:\n\s*)?Acme Test Co/i);
  expect(tail).toMatch(/SERVICE\s+PROVIDER\s*:\s*(?:\n\s*)?LawDog Demo LLC/i);
  expect(tail).not.toMatch(/CLIENT\s*:\s*(?:\n\s*)?LawDog Demo LLC/i);
  expect(tail).not.toMatch(/SERVICE\s+PROVIDER\s*:\s*(?:\n\s*)?Acme Test Co/i);

  const roles = resolvePaidProPartyRolesFromAcceptedCorpus(corpus);
  expect(roles.find((r) => r.role === "service_provider")?.legalName).toContain("LawDog");
  expect(roles.find((r) => r.role === "client")?.legalName).toContain("Acme");

  const signerIds = resolveSignerSetupPartyIdentities({
    parties: [{ name: LAWDOG }, { name: ACME }],
    intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
    agreementBodyText: corpus,
  });
  expect(signerIds[0]?.legalEntityName).toMatch(/Acme/i);
  expect(signerIds[1]?.legalEntityName).toMatch(/LawDog/i);
}

describe("LawDog/Acme synthetic P0 agreement defects", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
  });

  it("resolves commercial authority: LawDog provider, Acme client (not mention order)", () => {
    const authority = resolveStarterTwoPartyCommercialAuthority(LAWDOG_ACME_SYNTHETIC_INTAKE);
    expect(authority?.providerName).toContain("LawDog");
    expect(authority?.clientName).toContain("Acme");
  });

  it("parses provider-first opening roles from accepted corpus", () => {
    const roles = resolvePaidProPartyRolesFromAcceptedCorpus(buildDefectiveLawDogAcmeCorpus());
    expect(roles.find((r) => r.role === "service_provider")?.legalName).toContain("LawDog");
    expect(roles.find((r) => r.role === "client")?.legalName).toContain("Acme");
  });

  it("detects inverted signature blocks vs opening roles", () => {
    expect(detectExecutionBlockRoleInversion(buildDefectiveLawDogAcmeCorpus())).toBe(true);
  });

  it("merges split Independent Contractor heading", () => {
    const { text, repairs } = repairSplitPaidProHeadingFragments(buildDefectiveLawDogAcmeCorpus());
    expect(text).toMatch(/14\.\s+Independent Contractor/);
    expect(text).not.toMatch(/^14\.\s+Independent\s*$/m);
    expect(text.split("\n").some((l) => l.trim() === "Contractor")).toBe(false);
    expect(repairs.some((r) => r.startsWith("split_heading_fragment:14"))).toBe(true);
  });

  it("demotes empty orphan parent headings into contiguous hierarchy", () => {
    const split = repairSplitPaidProHeadingFragments(buildDefectiveLawDogAcmeCorpus()).text;
    const { text, repairs } = repairPaidProEmptyParentSectionHierarchy(split);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toMatch(/\d+\.\s+Fees and Payment/);
    expect(text).toMatch(/\d+\.\d+\s+Subscription Fee/);
    expect(text).not.toMatch(/^\d+\.\s+Subscription Fee\s*$/m);
    expect(text).toMatch(/\d+\.\s+Termination\s*$/m);
    expect(text).toMatch(/\d+\.\d+\s+Termination for Convenience/);
    expect(text).not.toMatch(/^\d+\.\s+Termination for Convenience\s*$/m);
    expect(text).toMatch(/General Provisions/);
    expect(text).toMatch(/Independent Contractor/);
    // Signature region preserved and still detectable for role reconcile.
    expect(text).toMatch(/\bIN WITNESS WHEREOF\b/i);
    expect(text).toMatch(/CLIENT\s*:/i);
  });

  it("preparePaidProReviewDisplayPlain reconciles roles, headings, and numbering", () => {
    const defective = buildDefectiveLawDogAcmeCorpus();
    expect(detectExecutionBlockRoleInversion(defective)).toBe(true);
    const { text, repairs } = preparePaidProReviewDisplayPlain(defective, {
      frozenDisplayOnly: false,
    });
    const tail = text.slice(text.search(/\bIN WITNESS WHEREOF\b/i));
    expect(detectExecutionBlockRoleInversion(text)).toBe(false);
    expect(tail).toMatch(/CLIENT\s*:\s*(?:\n\s*)?Acme Test Co/i);
    expect(tail).toMatch(/SERVICE\s+PROVIDER\s*:\s*(?:\n\s*)?LawDog Demo LLC/i);
    expect(text).toMatch(/Independent Contractor/);
    expect(text).not.toMatch(/^\d+\.\s+Independent\s*$/m);
    expect(text).toMatch(/\d+\.\d+\s+Subscription Fee/);
    expect(
      repairs.some(
        (r) => r.includes("reconcile_execution_block_roles") || r.startsWith("empty_parent_demote"),
      ),
    ).toBe(true);

    // Rendered-document verification: heading classifier must not emit Independent and Contractor as
    // separate main headings after repair.
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const independentAlone = lines.filter((l) => /^\d+\.\s+Independent$/i.test(l));
    const contractorAlone = lines.filter((l) => /^Contractor$/i.test(l));
    expect(independentAlone).toHaveLength(0);
    expect(contractorAlone).toHaveLength(0);
    expect(lines.some((l) => /^\d+\.\d*\s*Independent Contractor$/i.test(l) || /Independent Contractor/i.test(l))).toBe(
      true,
    );
  });

  it("freeze + frozen first-review paint: opening, notices, signer labels, and signature block agree", () => {
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    const defective = expandOperativeCorpusWithUniqueSupplements(
      buildDefectiveLawDogAcmeCorpus(),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 800,
    );
    expect(detectExecutionBlockRoleInversion(defective)).toBe(true);

    // Freeze commit is the SoT authority path — must reconcile roles even when length-floor
    // restore would otherwise keep the inverted signature tail.
    const prep = preparePaidProFreezeCandidateText({
      text: defective,
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      source: "server_full_draft",
      surface: "lawdog_acme_synthetic_p0",
    });
    assertLawDogAcmeRoleAgreement(prep.text);

    // Post-acceptance first-review paint uses frozen display prep only (no execution rebuild).
    // Roles must already be correct in the freeze/SoT corpus so the frozen projection agrees.
    const frozenDisplay = preparePaidProFrozenDisplayPlain(prep.text).text;
    assertLawDogAcmeRoleAgreement(frozenDisplay);
  });

  it("first-review CTA: Add signer details before complete; Prepare for signing only after both parties complete", () => {
    expect(PAID_PRO_REVIEW_BADGE).toBe("Agreement draft");
    expect(PAID_PRO_REVIEW_CHIP_VERSION).toBe("Agreement draft");
    expect(PAID_PRO_REVIEW_BADGE.toLowerCase()).not.toContain("pro");
    expect(PREMIUM_PRO_WAIT_TITLE_PROCESSING).toMatch(/agreement draft/i);
    expect(PREMIUM_PRO_WAIT_TITLE_PROCESSING.toLowerCase()).not.toContain("final pro");

    const steps = resolvePaidProReviewTrustSteps({ signersReady: false });
    expect(steps.map((s) => s.label)).toContain(PAID_PRO_REVIEW_AUTOMATED_DRAFT_CHECKS_LABEL);
    expect(steps.map((s) => s.label).join(" ")).not.toMatch(/Legal review complete/i);

    // Pre-signer first review: primary action is Add signer details (not Prepare for signing).
    expect(resolvePaidProReviewSignerDetailsActionLabel(false)).toBe(
      PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL,
    );
    expect(PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL).toBe("Add signer details");
    const incompleteSticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(incompleteSticky.phase).toBe("signer_details_required");
    expect(incompleteSticky.action).toBe("complete_recipient_details");
    expect(incompleteSticky.label).not.toBe(PAID_PRO_PREPARE_ESIGN_DECISION_CTA);

    // After both parties' signer details are complete: Prepare for signing becomes the decision CTA.
    expect(resolvePaidProReviewSignerDetailsActionLabel(true)).toBe("Edit signer details");
    expect(PAID_PRO_PREPARE_ESIGN_DECISION_CTA).toBe("Prepare for signing");
    const completeSticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    // Review-decision phase (no sticky bar) — Prepare for signing is the on-card decision, not sticky.
    expect(completeSticky.phase).toBe("review_decision");
    expect(completeSticky.showStickyBar).toBe(false);
  });
});
