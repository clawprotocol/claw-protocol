/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "../components/agreements/paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruthState";
import { writeReviewFirstPinnedCorpus } from "../launch/simpleProduct/reviewFirstSendSurface";
import { resolveAgreementCorpusForPrepareHandoff } from "./vs01PrepareBridgeCorpus";
import {
  FIRST_FAILING_STALE_TEMPLATE_SEED_PREDICATE,
  REFRESH_STALE_SEEDED_DOCUMENT_REASON,
  REUSE_MATCHING_SEEDED_DOCUMENT_REASON,
  isNonBindingDraftTemplateCorpus,
  resolveSeededDocumentReuseFromReviewCorpus,
  seededPacketMatchesReviewCorpus,
} from "./vs01ReviewCorpusSeedRefresh";
import {
  buildVs01CanonicalPacketSeed,
  loadVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketSeed,
  storeVs01CanonicalPacketPortable,
  storeVs01CanonicalPacketSeed,
} from "./vs01CanonicalPacketSeed";
import { loadVs01DraftState, saveVs01DraftState } from "./vs01DraftStatePersist";
import {
  RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
  isPaidProPacketReadyDashboardPath,
  resolvePostPrepareBuyerSurface,
} from "./vs01PrivateSigningLinksLanding";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SEEDED_DOC = "doc_e959491fdcef431c96052cbb74e0fdaf";

function padCorpus(body: string): string {
  return `${body}\n\n${"The parties agree to perform the stated obligations in good faith. ".repeat(40)}`;
}

function reviewServicesAgreement(): string {
  return padCorpus(
    [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Northline Studio (Client) and Harbor Marks LLC (Service Provider).",
      "",
      "10. LIABILITY",
      "Each party's aggregate liability is limited to fees paid under this Agreement.",
      "",
      "11. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of Texas.",
      "",
      "12. NOTICES",
      "If to Northline Studio:",
      "Attn: Priya Shah",
      "Email: priya@example.test",
      "",
      "If to Harbor Marks LLC:",
      "Attn: Diego Alvarez",
      "Email: diego@example.test",
      "",
      "13. MISCELLANEOUS",
      "This Agreement constitutes the entire agreement of the parties.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Northline Studio",
      "By: ______________________",
      "Name: Priya Shah",
      "Title: Founder",
      "Date: ____________________",
      "",
      "SERVICE PROVIDER:",
      "Harbor Marks LLC",
      "By: ______________________",
      "Name: Diego Alvarez",
      "Title: Principal",
      "Date: ____________________",
    ].join("\n"),
  );
}

function nonBindingTemplatePacket(): string {
  return padCorpus(
    [
      "Draft Agreement (non-binding template)",
      "",
      "This Draft Agreement is between Northline Studio (Client) and Harbor Marks LLC (Service Provider).",
      "",
      "1. SCOPE",
      "Provider will deliver the services described in the intake.",
      "",
      "2. COMPENSATION",
      "Fees are due as stated in the attached schedule.",
      "",
      "3. TERM",
      "This agreement continues until completed or terminated.",
      "",
      "4. CONFIDENTIALITY",
      "Each party will protect confidential information.",
      "",
      "5. IP",
      "Work product ownership follows the parties' written allocation.",
      "",
      "6. TERMINATION",
      "Either party may terminate for material breach.",
      "",
      "7. GENERAL",
      "This is a starter packet only.",
      "",
      "8. SIGNATURES",
      "Northline Studio",
      "Harbor Marks LLC",
    ].join("\n"),
  );
}

describe("Prepare remount refreshes stale template seed from Review SoT", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPaidProSourceOfTruth();
  });

  it("names the first failing predicate: reuse kept the template body", () => {
    expect(FIRST_FAILING_STALE_TEMPLATE_SEED_PREDICATE).toBe(
      "reuse_seeded_vs01_document_keeps_stale_template_body",
    );
    expect(isNonBindingDraftTemplateCorpus(nonBindingTemplatePacket())).toBe(true);
    expect(isNonBindingDraftTemplateCorpus(reviewServicesAgreement())).toBe(false);
    expect(
      seededPacketMatchesReviewCorpus(nonBindingTemplatePacket(), reviewServicesAgreement()),
    ).toBe(false);
  });

  it("remount Prepare with a paid-Pro Review corpus must not seed/show a non-binding template", () => {
    const review = reviewServicesAgreement();
    replacePaidProSourceOfTruth({
      text: nonBindingTemplatePacket(),
      hash: hashPaidProCorpus(nonBindingTemplatePacket()),
      accepted_at: Date.now(),
      source: "server_full_draft",
    });
    writeReviewFirstPinnedCorpus(AGREEMENT_ID, review);

    const resolved = resolveAgreementCorpusForPrepareHandoff({
      agreementId: AGREEMENT_ID,
      draft: null,
      bridgeCorpusText: review,
    });
    expect(resolved).toBe(review);
    expect(resolved).toMatch(/SERVICES AGREEMENT/);
    expect(resolved).toMatch(/10\.\s+LIABILITY/i);
    expect(resolved).toMatch(/laws of the State of Texas/);
    expect(resolved).toMatch(/12\.\s+NOTICES/i);
    expect(resolved).toMatch(/13\.\s+MISCELLANEOUS/i);
    expect(resolved).toMatch(/Priya Shah/);
    expect(resolved).toMatch(/Diego Alvarez/);
    expect(resolved).not.toMatch(/Draft Agreement \(non-binding template\)/i);
  });

  it("stale vs01 document with template body is refreshed from Review SoT", () => {
    const review = reviewServicesAgreement();
    const template = nonBindingTemplatePacket();
    const stale = buildVs01CanonicalPacketSeed({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      corpusPlain: template,
    });
    expect(stale).not.toBeNull();
    storeVs01CanonicalPacketSeed(stale!);
    storeVs01CanonicalPacketPortable(SEEDED_DOC, {
      v: 1,
      seed: stale!,
      fields: [],
      roles: [],
      pageCount: 2,
      witnessPageIndex: 1,
      initialsPolicy: { enabled: false, bodyPagesOnly: true },
      fieldCount: 0,
    });
    saveVs01DraftState({
      v: 1,
      documentId: SEEDED_DOC,
      step: 2,
      furthestStep: 2,
      agreementTitle: "Draft Agreement",
      creatorName: "Northline Studio",
      creatorEmail: "",
      creatorSignerName: "",
      creatorSignerTitle: "",
      senderMessage: "",
      counterparties: [{ id: "cp1", name: "Harbor Marks LLC", email: "", phone: "" }],
      senderPlacedFields: [],
      recipientPlacedFields: [],
      senderSignatureRef: null,
      savedAt: Date.now(),
    });

    const decision = resolveSeededDocumentReuseFromReviewCorpus({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      existingBridgeCorpus: template,
    });
    expect(decision.documentId).toBe(SEEDED_DOC);
    expect(decision.refreshed).toBe(true);
    expect(decision.storedWasTemplate).toBe(true);
    expect(decision.reason).toBe(REFRESH_STALE_SEEDED_DOCUMENT_REASON);

    const refreshed = loadVs01CanonicalPacketSeed(SEEDED_DOC);
    expect(refreshed?.corpusPlain).toBe(review);
    expect(refreshed?.corpusPlain).not.toMatch(/Draft Agreement \(non-binding template\)/i);
    expect(refreshed?.corpusPlain).toMatch(/10\.\s+LIABILITY/i);
    expect(loadVs01CanonicalPacketPortable(SEEDED_DOC)).toBeNull();
    expect(loadVs01DraftState(SEEDED_DOC)).toBeNull();
  });

  it("reuse of a matching Review seed still works and does not remint", () => {
    const review = reviewServicesAgreement();
    const matching = buildVs01CanonicalPacketSeed({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      corpusPlain: review,
    });
    expect(matching).not.toBeNull();
    storeVs01CanonicalPacketSeed(matching!);

    const decision = resolveSeededDocumentReuseFromReviewCorpus({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      existingBridgeCorpus: review,
    });
    expect(decision.documentId).toBe(SEEDED_DOC);
    expect(decision.refreshed).toBe(false);
    expect(decision.reason).toBe(REUSE_MATCHING_SEEDED_DOCUMENT_REASON);
    expect(loadVs01CanonicalPacketSeed(SEEDED_DOC)?.corpusPlain).toBe(review);
  });

  it("409 still does not eject to dashboard after a Review-corpus refresh", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: SEEDED_DOC,
      currentPath: `/app/esign/${SEEDED_DOC}?agreement_bridge=1`,
      recipientAccessTokenStatus: 409,
    });
    expect(landing.stayOnPrivateLinks).toBe(true);
    expect(landing.navigateTo).toBeNull();
    expect(landing.reason).toBe(RECIPIENT_ACCESS_TOKEN_409_STAY_REASON);
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? `/app/esign/${SEEDED_DOC}`)).toBe(
      false,
    );
  });
});
