/**
 * P0 LawDog/Acme reviewed-document integrity — staging-shaped corpus through
 * freeze / SoT / review-render / persist gates.
 */
/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LAWDOG_ACME_SYNTHETIC_INTAKE,
} from "./paidProLawDogAcmeSyntheticP0.test";
import {
  assertPaidProReviewedDocumentIntegrity,
  diagnosePaidProReviewedDocumentIntegrity,
  preparePaidProImmutableReviewedDocument,
} from "./paidProReviewedDocumentIntegrity";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import {
  persistWorkspaceAgreementAfterReviewReady,
} from "./paidProReviewReadyWorkspacePersist";
import {
  PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL,
  resolvePaidProReviewSignerDetailsActionLabel,
} from "./authoritativePaidProReview";
import { containsUnresolvedRenderTokens } from "./userVisibleRenderTokenAuthority";
import { markPaidReviewSessionPremiumGeneration } from "./paidProReviewSessionCorpusInvariantState";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";

const LAWDOG = "LawDog Demo LLC";
const ACME = "Acme Test Co";

/** Staging-shaped defective corpus: duplicate intro + [ORG_1], empty parents, bad Confidentiality xref. */
function buildStagingDefectiveLawDogAcmeCorpus(): string {
  const pad = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      `Additional commercial detail (${i + 1}) — the parties agree to cooperate in good faith on the engagement.`,
    ).join(" ");
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${ACME} ("Client") and ${LAWDOG} ("Service Provider").`,
    "",
    `This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between [ORG_1] ("Provider") and ${ACME}. ("Client").`,
    "",
    "1. Purpose",
    "This Agreement sets forth the terms for the subscription services described below.",
    "2. Services",
    "3. Subscription Service",
    "Provider will provide agreement-drafting software access to Client.",
    "4. Fees and Payment",
    "5. Subscription Fee",
    "Client will pay Provider a subscription fee of $1,000 per month.",
    "6. Term and Cancellation",
    "7. Term",
    "The term is thirty (30) days from the Effective Date. Either party may cancel with seven (7) days' written notice.",
    "8. Intellectual Property and Data",
    "9. Provider Ownership",
    "Provider retains ownership of the platform and related intellectual property.",
    "10. Confidentiality",
    "Each party will protect Confidential Information as set forth in this Agreement.",
    "11. Representations, Warranties and Compliance",
    "12. Mutual Authority",
    "Each party represents that it has authority to enter into this Agreement.",
    "13. Liability",
    "14. Exclusion of Certain Damages",
    "Except for obligations under Section 5 (Confidentiality), neither party is liable for indirect damages.",
    "15. Suspension and Termination",
    "16. Material Breach",
    "Either party may terminate for material breach after a cure period.",
    "17. General Terms",
    "18. Independent Contractor",
    "18.1 Independent Contractor",
    "Provider is an independent contractor and not an employee of Client.",
    "18.2 Assignment",
    "Neither party may assign without consent.",
    "18.3 Notices",
    `If to ${LAWDOG}: Attention: Authorized Signer.`,
    `If to ${ACME}: Attention: Authorized Signer.`,
    "19. Notices",
    `If to ${LAWDOG}: Attention: Authorized Signer.`,
    `If to ${ACME}: Attention: Authorized Signer.`,
    "20. Governing Law",
    "This Agreement shall be governed by the laws of Illinois.",
    "",
    pad(40),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    ACME,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "",
    "SERVICE PROVIDER:",
    LAWDOG,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
  ].join("\n");
}

function lawDogDraft() {
  return {
    title: "Services Agreement",
    jurisdiction: "Illinois",
    parties: [
      { name: LAWDOG, role: "Service Provider" },
      { name: ACME, role: "Client" },
    ],
    purpose: "agreement-drafting software subscription",
    payment_terms: "$1,000 per month",
    duration: "30 days",
    due_date: null,
    effective_date: null,
    payment: { amount: 1000, cadence: "monthly", valid: true },
  };
}

describe("LawDog/Acme reviewed-document integrity P0", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    vi.restoreAllMocks();
  });

  it("diagnoses staging defects before repair", () => {
    const defective = buildStagingDefectiveLawDogAcmeCorpus();
    const diag = diagnosePaidProReviewedDocumentIntegrity(defective);
    expect(diag.unresolvedIdentityTokens.some((t) => /ORG_1/i.test(t))).toBe(true);
    expect(diag.reasons).toContain("unresolved_identity_token");
    expect(diag.reasons).toContain("duplicate_opening_recital");
    expect(diag.emptyTopLevelHeadings.length).toBeGreaterThan(0);
    expect(diag.reasons).toContain("broken_named_section_reference");
    expect(containsUnresolvedRenderTokens(defective)).toBe(true);
  });

  it("repairs into one coherent hierarchy with resolved parties and correct Confidentiality xref", () => {
    const defective = buildStagingDefectiveLawDogAcmeCorpus();
    const prepared = preparePaidProImmutableReviewedDocument(defective);
    expect(prepared.ok, prepared.diagnostics.reasons.join(",")).toBe(true);
    const text = prepared.text;
    expect(text).not.toMatch(/\[ORG_\d+\]/i);
    expect(text).not.toMatch(/\bORG_1\b/i);
    expect((text.match(/\bThis Agreement is between\b/gi) || []).length).toBe(1);
    expect(text).not.toMatch(/by and between \[ORG_1\]/i);
    expect(text).toMatch(new RegExp(`${ACME}.*"Client"`, "i"));
    expect(text).toMatch(new RegExp(`${LAWDOG}.*"Service Provider"`, "i"));
    // Empty-parent splice must be gone: Subscription Fee/Term/etc are subsections, not siblings.
    expect(text).not.toMatch(/^\d+\.\s+Subscription Service\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Subscription Fee\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Term\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Provider Ownership\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Mutual Authority\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Exclusion of Certain Damages\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Material Breach\s*$/m);
    expect(text).not.toMatch(/^\d+\.\s+Notices\s*$/m);
    expect(text).toMatch(/\d+\.\d+\s+Subscription (?:Service|Fee)/);
    const confHeading = text.match(/^(\d+)\.\s+Confidentiality\b/m);
    expect(confHeading).toBeTruthy();
    const confNum = confHeading![1];
    expect(text).toMatch(new RegExp(`Section\\s+${confNum}\\s*\\(Confidentiality\\)`, "i"));
    expect(text).not.toMatch(/Section\s+5\s*\(Confidentiality\)/i);
    assertPaidProReviewedDocumentIntegrity(text);
  });

  it("SoT / first-review paint / persist share one immutable canonical hash", async () => {
    const defective = buildStagingDefectiveLawDogAcmeCorpus();
    const prepared = preparePaidProImmutableReviewedDocument(defective);
    expect(prepared.ok, prepared.diagnostics.reasons.join(",")).toBe(true);
    expect(prepared.text).not.toMatch(/\[ORG_\d+\]/i);
    expect(prepared.text).toMatch(/Section\s+\d+\s*\(Confidentiality\)/i);
    expect(prepared.text).not.toMatch(/Section\s+5\s*\(Confidentiality\)/i);

    const genId = getOrInitSessionAgreementGenerationId();
    markPaidReviewSessionPremiumGeneration(genId, "lawdog_acme_integrity");
    latchAcceptedServerFullDraftAuthority(prepared.text, "server_full_draft");
    markPaidProPipelineAcceptedCorpusHash(prepared.text);
    markPaidProPipelineValidationPassed({
      text: prepared.text,
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: prepared.text,
      source: "server_full_draft",
      draft: lawDogDraft(),
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      agreementGenerationId: genId,
      reviewSessionId: genId,
      generationOutcome: "ok",
    });
    const sot = getPaidProSourceOfTruthText().trim();
    const canonicalHash = hashPaidProCorpus(sot);
    expect(sot.length).toBeGreaterThan(1000);
    expect(diagnosePaidProReviewedDocumentIntegrity(sot).reasons).toEqual([]);
    expect(sot).toContain(LAWDOG);
    expect(sot).toContain(ACME);
    expect(sot).not.toMatch(/\[ORG_\d+\]/i);
    expect(sot).not.toMatch(/by and between \[ORG_1\]/i);
    expect((sot.match(/\bThis Agreement is between\b/gi) || []).length).toBeLessThanOrEqual(1);

    const display = preparePaidProReviewDisplayPlain(sot, { frozenDisplayOnly: true });
    expect(hashPaidProCorpus(display.text.trim())).toBe(canonicalHash);

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "",
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      acceptedCanonicalPlain: sot,
      draft: lawDogDraft(),
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
    });
    expect(painted.plain).toBe(sot);
    expect(hashPaidProCorpus(painted.plain)).toBe(canonicalHash);
    expect(resolvePaidProReviewSignerDetailsActionLabel(false)).toBe(
      PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL,
    );

    let draftPosts = 0;
    const persist = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: true,
      skipFreeStarterCreateSubmit: true,
      ensurePersist: async () => {
        draftPosts += 1;
        return "ag_lawdog_acme_integrity_1";
      },
    });
    expect(persist).toEqual({
      ok: true,
      agreementId: "ag_lawdog_acme_integrity_1",
      created: true,
    });
    expect(draftPosts).toBe(1);
  });

  it("invalid unresolved-[ORG_1]-only corpus is rejected and does not persist or consume allowance", async () => {
    // Token that party-slot repair cannot resolve (beyond canonical 2-party map).
    const forced = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between ${ACME} ("Client") and ${LAWDOG} ("Service Provider").`,
      "",
      "1. Services",
      "Provider supplies agreement-drafting software.",
      "2. Fees",
      "Client pays $1,000 per month.",
      "3. Term",
      "The term is thirty (30) days.",
      "4. Confidentiality",
      "Each party protects confidential information.",
      "5. Liability",
      "Except for obligations under Section 4 (Confidentiality), liability is limited.",
      "6. Governing Law",
      "Illinois law applies.",
      "",
      "Notice copy for unresolved affiliate [ORG_9] must never reach review-ready.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      ACME,
      "SERVICE PROVIDER:",
      LAWDOG,
    ].join("\n\n");

    const prepared = preparePaidProImmutableReviewedDocument(forced);
    expect(prepared.ok).toBe(false);
    expect(prepared.diagnostics.reasons).toContain("unresolved_identity_token");
    expect(() => assertPaidProReviewedDocumentIntegrity(prepared.text)).toThrow(
      /reviewed-document-integrity-blocked/,
    );

    const freeze = buildPaidProFreezeCandidate({
      text: forced,
      source: "server_full_document_text",
      draft: lawDogDraft(),
      intakeText: LAWDOG_ACME_SYNTHETIC_INTAKE,
      agreementGenerationId: "gen_invalid_org9",
      generationOutcome: "ok",
      surface: "lawdog_acme_invalid_org9",
    });
    expect(freeze.ok).toBe(false);
    expect(freeze.rejectReason || "").toMatch(
      /unresolved_identity_token|unresolved_render_tokens|empty_top_level_heading|reviewed_document_integrity|duplicate_/i,
    );

    const validation = validatePaidProOutput({
      text: forced,
      draft: lawDogDraft(),
      rawIntake: LAWDOG_ACME_SYNTHETIC_INTAKE,
      premiumPipelineSource: "server_full_document_text",
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons.join(" ")).toMatch(/unresolved_identity_token/);

    let draftPosts = 0;
    let allowanceUsed = 0;
    const persist = await persistWorkspaceAgreementAfterReviewReady({
      canonicalReviewEntered: false,
      skipFreeStarterCreateSubmit: true,
      ensurePersist: async () => {
        draftPosts += 1;
        allowanceUsed += 1;
        return "should_not_create";
      },
    });
    expect(persist.ok).toBe(false);
    expect(draftPosts).toBe(0);
    expect(allowanceUsed).toBe(0);
  });

  it("uses the exact LawDog/Acme synthetic intake string", () => {
    expect(LAWDOG_ACME_SYNTHETIC_INTAKE).toBe(
      "Create a services agreement between LawDog Demo LLC and Acme Test Co. LawDog Demo LLC will provide agreement-drafting software for $1,000 per month. The term is 30 days. Either party may cancel with 7 days’ written notice. Illinois law applies.",
    );
  });
});
