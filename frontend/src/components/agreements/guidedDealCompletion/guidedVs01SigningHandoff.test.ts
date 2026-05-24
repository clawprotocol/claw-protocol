import { describe, expect, it } from "vitest";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import { buildGuidedVs01SigningHandoff } from "./guidedVs01SigningHandoff";
import { stripPhantomGuidedSectionMarkers } from "./guidedFinalReviewToSigning";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "./signatureRegion";
import { resolveFinalVs01CorpusOrBlock } from "../../../vs01/vs01SigningCorpus";
import { resolvePremiumSignaturePreviewMode } from "../premiumAgreementDocumentHtml";

const SHORT_FALLBACK = `${"Starter preview body. ".repeat(40)}`.slice(0, 735);

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

function frozenCorpus(lenPad = 55): string {
  return `${"Premium operative clause with milestones, remedies, and payment mechanics. ".repeat(lenPad)}${witnessBlock()}`;
}

describe("guided VS01 signing handoff", () => {
  it("passes the exact frozen signer-applied corpus to VS01 over stale draft_authoritative", () => {
    const frozen = frozenCorpus(55);
    const staleDraft = `${frozen} Stale server_full_document_text appendix that must not win.`;
    expect(staleDraft.length).toBeGreaterThan(frozen.length);

    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: frozen,
      source: "finalized_signer_applied_guided_corpus",
      signatureRebuilt: true,
    });

    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: frozen,
      guidedSigningHandoff: handoff,
      draft: {
        parties: [],
        title: "MSA",
        premium_full_document_text: staleDraft,
        server_full_document_text: staleDraft,
      } as never,
      guidedPro: true,
      freeBaselinePlain: SHORT_FALLBACK,
      signatureRebuilt: true,
    });

    expect(resolution.allowed).toBe(true);
    expect(resolution.source).toBe("finalized_signer_applied_guided_corpus");
    expect(resolution.len).toBe(frozen.length);
    expect(fingerprintAgreementBody(resolution.corpus)).toBe(handoff.corpusHash);
    expect(fingerprintAgreementBody(resolution.corpus)).not.toBe(fingerprintAgreementBody(staleDraft));
  });

  it("allows signatureRebuilt corpus when witness and By/Signature lines exist", () => {
    const corpus = frozenCorpus(58);
    expect(corpusHasVisibleSignatureExecutionLines(corpus)).toBe(true);
    expect(corpusSignatureBlocksHaveRequiredByLines(corpus, 2)).toBe(true);
    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: corpus,
      source: "finalized_signer_applied_guided_corpus",
      signatureRebuilt: true,
    });
    const resolution = resolveFinalVs01CorpusOrBlock({
      guidedSigningHandoff: handoff,
      guidedPro: true,
      signatureRebuilt: true,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolvePremiumSignaturePreviewMode(resolution.corpus, 2).mode).not.toBe(
      "decorative_fallback_signature_card",
    );
  });

  it("strips orphan 4.2. and **7.** markers before handoff", () => {
    const raw = `1. Purpose and Scope

Body text here.

4.2.

**7.**

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________`;
    const cleaned = stripPhantomGuidedSectionMarkers(raw);
    expect(cleaned.text).not.toMatch(/^\s*4\.2\.\s*$/m);
    expect(cleaned.text).not.toMatch(/^\s*\*\*7\.\*\*\s*$/m);
    expect(cleaned.repairs.length).toBeGreaterThan(0);
  });
});
