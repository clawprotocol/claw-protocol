import { describe, expect, it } from "vitest";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../components/agreements/simpleProFinalReviewCorpus";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import {
  resolveVs01SigningCorpusForHandoff,
  VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN,
} from "./vs01SigningCorpus";

const SHORT_FALLBACK = `${"Starter preview body. ".repeat(40)}`.slice(0, 735);

function longOperativePad(): string {
  return `${"Operative clause detail with mutual obligations. ".repeat(55)}\n`;
}

function witnessBlock(): string {
  return `
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
Signature: _______________
Name: Joe Smith
Date: ____________________`;
}

function fullGuidedCorpus(): string {
  return `${longOperativePad()}${witnessBlock()}`;
}

const bridge: AgreementVs01BridgeSession = {
  vs01DocumentId: "vs01-doc-1",
  agreementId: "agr-1",
  agreementTitle: "MSA",
  creatorName: "Acme LLC",
  creatorEmail: "owner@acme.test",
  creatorSignerName: "Anthem H Blanchard",
  creatorSignerTitle: "Manager",
  counterparties: [
    {
      id: "cp-1",
      name: "Joe Smith",
      email: "joe@provider.test",
      signerName: "Joe Smith",
    },
  ],
  targetStep: 2,
  senderFirstLawdogHandoff: true,
};

describe("vs01SigningCorpus", () => {
  it("blocks guided Pro when handoff is short free-hash-equivalent fallback", () => {
    const resolution = resolveVs01SigningCorpusForHandoff({
      agreementCorpusText: SHORT_FALLBACK,
      guidedPro: true,
      freeBaselinePlain: SHORT_FALLBACK,
    });
    expect(resolution.allowed).toBe(false);
    expect(resolution.len).toBeLessThanOrEqual(VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN);
    expect(resolution.isFreeHashMatch).toBe(true);
    expect(["free_basic_hash_match", "corpus_too_short_for_guided_pro"]).toContain(
      resolution.blockReason,
    );
  });

  it("allows guided Pro when authoritative handoff corpus has witness block and By/Signature lines", () => {
    const corpus = fullGuidedCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    const resolution = resolveVs01SigningCorpusForHandoff({
      agreementCorpusText: corpus,
      guidedPro: true,
      freeBaselinePlain: SHORT_FALLBACK,
      bridge,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.hasWitnessBlock).toBe(true);
    expect(resolution.hasByOrSignatureLines).toBe(true);
    expect(resolution.isFreeHashMatch).toBe(false);
  });

  it("rebuilds witness block when operative body is long but signature lines are missing", () => {
    const bodyOnly = longOperativePad();
    expect(bodyOnly.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    const resolution = resolveVs01SigningCorpusForHandoff({
      agreementCorpusText: bodyOnly,
      guidedPro: true,
      bridge,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.source).toBe("rebuilt_witness_block");
    expect(resolution.hasWitnessBlock).toBe(true);
    expect(resolution.hasByOrSignatureLines).toBe(true);
    expect(/IN WITNESS WHEREOF/i.test(resolution.corpus)).toBe(true);
  });

  it("does not use decorative fallback signature card for guided Pro signer corpus", () => {
    const corpus = fullGuidedCorpus();
    const preview = resolvePremiumSignaturePreviewMode(corpus, 2);
    expect(preview.hasCorpusSignatureBlock).toBe(true);
    expect(preview.mode).not.toBe("decorative_fallback_signature_card");
  });

  it("test58-style handoff: guided Pro resolution never reports missing signature block when allowed", () => {
    const corpus = fullGuidedCorpus();
    const resolution = resolveVs01SigningCorpusForHandoff({
      agreementCorpusText: corpus,
      guidedPro: true,
      bridge,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.hasWitnessBlock).toBe(true);
    const preview = resolvePremiumSignaturePreviewMode(resolution.corpus, resolution.signerCount);
    expect(preview.hasCorpusSignatureBlock).toBe(true);
  });

  it("prefers longer draft authoritative text over short handoff preview", () => {
    const draftCorpus = fullGuidedCorpus();
    const resolution = resolveVs01SigningCorpusForHandoff({
      agreementCorpusText: SHORT_FALLBACK,
      draft: {
        parties: [],
        title: "MSA",
        premium_full_document_text: draftCorpus,
      } as never,
      guidedPro: true,
      freeBaselinePlain: SHORT_FALLBACK,
      bridge,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.len).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(fingerprintAgreementBody(resolution.corpus)).toBe(fingerprintAgreementBody(draftCorpus));
  });
});
