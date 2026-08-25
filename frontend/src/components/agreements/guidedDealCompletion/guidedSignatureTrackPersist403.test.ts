/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgreementDraft } from "../../../agreement/agreementTypes";
import { buildGuidedVs01SigningHandoff } from "./guidedVs01SigningHandoff";
import { prepareGuidedSigningCorpusCleanup } from "./guidedFinalReviewToSigning";
import { resolveCanonicalFinalPartyManifest } from "./canonicalFinalPartyManifest";
import {
  canContinueGuidedSignatureTrackWithoutPersist,
  isGuidedSignatureDraftPersistLocallyContinuable,
  mintGuidedSignatureTrackLocalAgreementId,
} from "./guidedFinalReviewToSigning";
import {
  readAgreementVs01BridgeSession,
  tryNavigateGuidedSignatureTrackLocalVs01Esign,
} from "../../../launch/simpleProduct/agreementToVs01SigningBridge";
import { buildVs01RecipientSigningUrl } from "../../../vs01/StepReceipt";
import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN } from "./guidedReviewSigningContinuity";

const sessionStore = new Map<string, string>();

function signingCorpus(): string {
  const manifest = resolveCanonicalFinalPartyManifest({
    partyCount: 2,
    partySignerNames: ["Tom Thumb", ""],
    partySignerTitles: ["CEO", ""],
    recipient1Name: "Red Mesa Logistics LLC",
    recipient2Name: "Harbor Peak Automation LLC",
    recipient1Email: "owner@example.test",
    recipient2Email: "cp@example.test",
    extraPartyReviewEmails: [],
    draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    sendMode: "signature",
    recipientsDeferred: false,
  });
  const body = `
CONSULTING AND IMPLEMENTATION AGREEMENT

1. Services
Provider delivers automation services. ${"Scope detail with milestones, approvals, and delivery checkpoints. ".repeat(80)}

2. Payment
Invoices are due Net 30.

3. Confidentiality
Each party protects confidential information.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Tom Thumb
Title: CEO
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Howard Monroe
Title: Member
Date: ____________________`.trim();
  return prepareGuidedSigningCorpusCleanup({ body, partyManifest: manifest }).body;
}

function sampleDraft(corpus: string): AgreementDraft {
  return {
    id: "",
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      {
        name: "Red Mesa Logistics LLC",
        role: "owner",
        email: "owner@example.test",
        signerName: "Tom Thumb",
        signerTitle: "CEO",
      },
      {
        name: "Harbor Peak Automation LLC",
        role: "party",
        email: "cp@example.test",
        signerName: "Howard Monroe",
        signerTitle: "Member",
      },
    ],
    purpose: corpus.slice(0, 200),
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    server_full_document_text: corpus,
    premium_full_document_text: corpus,
  } as AgreementDraft;
}

describe("guided signature track persist 403 regression", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
    });
  });

  it("classifies draft POST 403 as locally continuable for direct signature track", () => {
    expect(isGuidedSignatureDraftPersistLocallyContinuable(403)).toBe(true);
    expect(isGuidedSignatureDraftPersistLocallyContinuable(401)).toBe(true);
    expect(isGuidedSignatureDraftPersistLocallyContinuable(500)).toBe(false);
    expect(isGuidedSignatureDraftPersistLocallyContinuable(null, "create_failed_http_403")).toBe(true);
  });

  it("allows local continuation only when persist failed without agreement id and handoff is ready", () => {
    const corpus = `${"D".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 40)}\n\nCLIENT:\nAcme\nBy: ____\n\nSERVICE PROVIDER:\nJoe\nBy: ____`;
    expect(
      canContinueGuidedSignatureTrackWithoutPersist({
        persistOk: false,
        agreementId: "",
        corpusText: corpus,
        handoffReady: true,
      }),
    ).toBe(true);
    expect(
      canContinueGuidedSignatureTrackWithoutPersist({
        persistOk: true,
        agreementId: "",
        corpusText: corpus,
        handoffReady: true,
      }),
    ).toBe(false);
    expect(
      canContinueGuidedSignatureTrackWithoutPersist({
        persistOk: false,
        agreementId: "ag_existing",
        corpusText: corpus,
        handoffReady: true,
      }),
    ).toBe(false);
    expect(
      canContinueGuidedSignatureTrackWithoutPersist({
        persistOk: false,
        agreementId: "",
        corpusText: "SERVICES AGREEMENT\n\nPainted after-pay deal body for local VS01. ".repeat(4),
        handoffReady: true,
        minCorpusLen: 200,
      }),
    ).toBe(true);
  });

  it("direct signature track 403 opens local VS01 bridge without server seed", () => {
    const corpus = signingCorpus();
    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: corpus,
      source: "finalized_signer_applied_guided_corpus",
      signatureRebuilt: true,
    });
    const localAgreementId = mintGuidedSignatureTrackLocalAgreementId();
    const navigate = vi.fn();
    const result = tryNavigateGuidedSignatureTrackLocalVs01Esign({
      navigate,
      localAgreementId,
      draft: sampleDraft(corpus),
      logReason: "guided_signature_track_local_bridge_test",
      agreementCorpusText: corpus,
      guidedSigningHandoff: handoff,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route).toMatch(/^\/app\/esign\/local_doc_/);
    expect(result.route).toContain("agreement_bridge=1");
    expect(navigate).toHaveBeenCalledWith(result.route);
    const bridge = readAgreementVs01BridgeSession();
    expect(bridge?.agreementId).toBe(localAgreementId);
    expect(bridge?.agreementCorpusText?.trim()).toBe(corpus);
    expect(bridge?.vs01DocumentId).toBe(result.documentId);
  });

  it("AgreementBuilderIntake skips review fallback and uses local bridge on guided signature persist 403", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedSignaturePersistFailureRef");
    expect(intake).toContain("tryNavigateGuidedSignatureTrackLocalVs01Esign");
    expect(intake).toContain("canContinueGuidedSignatureTrackWithoutPersist");
    expect(intake).toContain("isGuidedSignatureDraftPersistLocallyContinuable");
    expect(intake).toContain("logGuidedSignatureTrackLocalBridgeStart");
    const persistCatch = intake.slice(
      intake.indexOf("if (guidedSignatureTrackInFlightRef.current) {"),
      intake.indexOf("if (guidedSignatureTrackInFlightRef.current) {") + 500,
    );
    expect(persistCatch).toContain("guidedSignaturePersistFailureRef");
    expect(persistCatch).not.toContain('setDisplayPhase("review")');
    const trackBlock = intake.slice(
      intake.indexOf("const enterGuidedSignatureTrackRoute = React.useCallback"),
      intake.indexOf("const enterGuidedSignatureTrackRoute = React.useCallback") + 18000,
    );
    expect(trackBlock).toContain("tryNavigateGuidedSignatureTrackLocalVs01Esign");
    expect(trackBlock).toContain("logGuidedSignatureRouteEntered");
    expect(trackBlock).not.toContain('setDisplayPhase("review")');
  });

  it("review-first path remains blocked on draft POST 403", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    const reviewBlock = intake.slice(
      intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback"),
      intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback") + 12000,
    );
    expect(reviewBlock).toContain('runPersistAndOpen(mergedDraft, partyCtx, true, "review", "review", true)');
    expect(reviewBlock).toContain("failReviewFirstPersist");
    expect(reviewBlock).toContain("REVIEW_LINK_PERSIST_BLOCKING_MESSAGE");
    expect(reviewBlock).not.toContain("tryNavigateGuidedSignatureTrackLocalVs01Esign");
  });

  it("recipient invite URL still targets stable recipient signing route", () => {
    const url = buildVs01RecipientSigningUrl({
      documentId: "doc_recipient",
      counterpartyId: "cp_1",
      recipientIndex: 1,
      recipientName: "Harbor Peak Automation LLC",
      recipientEmail: "cp@example.test",
      receiptId: null,
      agreementId: "ag_test",
    });
    expect(url).toContain("/app/esign/doc_recipient?");
    expect(url).toContain("vs01_recipient_sign=1");
    expect(url).not.toContain("/app?");
    expect(url).not.toContain("/app/done/");
  });
});
