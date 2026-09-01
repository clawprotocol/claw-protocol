import { afterEach, describe, expect, it } from "vitest";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../components/agreements/simpleProFinalReviewCorpus";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import { buildGuidedVs01SigningHandoff } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import {
  clearAcceptedPremiumCanonicalCorpus,
  establishAcceptedPremiumCanonicalCorpus,
  getAcceptedPremiumCorpusForVs01Signing,
} from "../components/agreements/acceptedPremiumCanonicalCorpus";
import {
  resolveFinalVs01CorpusOrBlock,
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

function signerBlockWithoutWitness(): string {
  return `
CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Joe Smith
Title: President
Date: ____________________`;
}

function texasServicesCorpusWithoutWitness(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Texas electronic services agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    "The parties agree that electronic signatures are allowed and have the same effect as originals.",
    "",
    "1. Scope. Provider will perform workflow automation, CRM integration, training, and support services.",
    "2. Fees. Client will pay $95,000 split across kickoff, rollout, and acceptance milestones.",
    "3. Confidentiality. Each party will protect confidential business, technical, and customer information.",
    "4. Termination. Either party may terminate for uncured material breach or on thirty days notice.",
    "5. Governing Law. Texas law governs this Agreement.",
    "6. Miscellaneous. This Agreement may be signed electronically and in counterparts.",
    "",
    longOperativePad(),
    signerBlockWithoutWitness(),
  ].join("\n");
}

function explicitWitnessRequiredCorpusWithoutWitness(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Agreement must be witnessed by a disinterested adult witness before it is effective.",
    longOperativePad(),
    signerBlockWithoutWitness(),
  ].join("\n");
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

afterEach(() => {
  clearAcceptedPremiumCanonicalCorpus();
});

describe("vs01SigningCorpus", () => {
  it("allows Texas electronic services agreement with signer blocks and no witness block", () => {
    const corpus = texasServicesCorpusWithoutWitness();
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: corpus,
      guidedPro: true,
      bridge,
      intakeText:
        "Texas simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC. Electronic signatures allowed.",
      draft: {
        title: "Services Agreement",
        jurisdiction: "Texas",
        agreement_family: "services_agreement",
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
      } as never,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.requiresSignatureBlock).toBe(true);
    expect(resolution.requiresWitness).toBe(false);
    expect(resolution.witnessReason).toBeNull();
    expect(resolution.hasWitnessBlock).toBe(false);
    expect(resolution.hasByOrSignatureLines).toBe(true);
  });

  it("requires witness only when explicit witness requirement is present", () => {
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: explicitWitnessRequiredCorpusWithoutWitness(),
      guidedPro: true,
      bridge,
      intakeText: "Services agreement. The agreement must be witnessed before signing is complete.",
      draft: {
        title: "Services Agreement",
        jurisdiction: "Texas",
        agreement_family: "services_agreement",
      } as never,
    });
    expect(resolution.allowed).toBe(false);
    expect(resolution.requiresWitness).toBe(true);
    expect(resolution.witnessReason).toBe("explicit_witness_or_notary_requirement");
    expect(resolution.blockReason).toBe("missing_witness_block");
  });

  it("still blocks when ordinary signer blocks are missing", () => {
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: `${longOperativePad()}\nElectronic signatures are allowed.`,
      guidedPro: true,
      bridge: null,
      draft: {
        title: "Services Agreement",
        jurisdiction: "Texas",
        agreement_family: "services_agreement",
      } as never,
    });
    expect(resolution.allowed).toBe(false);
    expect(resolution.requiresSignatureBlock).toBe(true);
    expect(resolution.requiresWitness).toBe(false);
    expect(resolution.blockReason).toBe("missing_signature_block");
  });

  it("blocks guided Pro when handoff is short free-hash-equivalent fallback", () => {
    const resolution = resolveFinalVs01CorpusOrBlock({
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
    const resolution = resolveFinalVs01CorpusOrBlock({
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

  it("prefers accepted authoritative plain over short handoff corpus", () => {
    const longAccepted = fullGuidedCorpus();
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: SHORT_FALLBACK,
      guidedPro: true,
      acceptedAuthoritativePlain: longAccepted,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
      bridge,
    });
    expect(resolution.len).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(resolution.allowed).toBe(true);
    expect(resolution.len).toBeGreaterThan(SHORT_FALLBACK.length * 2);
  });

  it("blocks VS01 fallback when paid Pro is accepted but authoritative corpus is unavailable", () => {
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: "short free fallback",
      guidedPro: true,
      acceptedAuthoritativePlain: "",
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
      bridge,
    });
    expect(resolution.allowed).toBe(false);
    expect(resolution.source).toBe("blocked_short_preview");
    expect(resolution.blockReason).toBe("authoritative_corpus_unavailable");
    expect(resolution.corpus).toBe("");
  });

  it("rebuilds witness block when operative body is long but signature lines are missing", () => {
    const bodyOnly = longOperativePad();
    expect(bodyOnly.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    const resolution = resolveFinalVs01CorpusOrBlock({
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

  it("remount Review-paint without execution keeps rebuilt By lines (does not integrity-strip)", () => {
    const reviewPaint = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Northline Studio (Client) and Harbor Marks LLC (Service Provider).",
      "",
      ...Array.from(
        { length: 36 },
        (_, i) => `${i + 1}. Operative commercial clause with consideration and duties.`,
      ),
      "",
      "12. NOTICES",
      "If to Northline Studio:",
      "Attn: Priya Shah",
      "",
      "If to Harbor Marks LLC:",
      "Attn: Diego Alvarez",
      "",
      ...Array.from({ length: 8 }, () => "The parties agree to perform the stated obligations in good faith."),
    ].join("\n");
    expect(reviewPaint.length).toBeGreaterThanOrEqual(1500);
    expect(reviewPaint).not.toMatch(/IN WITNESS WHEREOF/i);
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: reviewPaint,
      acceptedReviewPlain: reviewPaint,
      guidedPro: true,
      bridge,
      manifestPartyCount: 2,
      prepareSignatureLinksRequested: true,
      signaturePreparationRequested: true,
      premiumComplete: true,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.source).toBe("rebuilt_witness_block");
    expect(resolution.hasByOrSignatureLines).toBe(true);
    expect(resolution.len).toBeGreaterThanOrEqual(1500);
    expect(/IN WITNESS WHEREOF/i.test(resolution.corpus)).toBe(true);
    expect(/By:/i.test(resolution.corpus)).toBe(true);
  });

  it("does not use decorative fallback signature card for guided Pro signer corpus", () => {
    const corpus = fullGuidedCorpus();
    const preview = resolvePremiumSignaturePreviewMode(corpus, 2);
    expect(preview.hasCorpusSignatureBlock).toBe(true);
    expect(preview.mode).not.toBe("decorative_fallback_signature_card");
  });

  it("test58-style handoff: guided Pro resolution never reports missing signature block when allowed", () => {
    const corpus = fullGuidedCorpus();
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: corpus,
      guidedPro: true,
      bridge,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.hasWitnessBlock).toBe(true);
    const preview = resolvePremiumSignaturePreviewMode(resolution.corpus, resolution.signerCount);
    expect(preview.hasCorpusSignatureBlock).toBe(true);
  });

  it("does not rebuild witness when finalized guided handoff corpus is complete", () => {
    const corpus = fullGuidedCorpus();
    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: corpus,
      source: "finalized_signer_applied_guided_corpus",
      signatureRebuilt: true,
    });
    const resolution = resolveFinalVs01CorpusOrBlock({
      guidedSigningHandoff: handoff,
      draft: {
        parties: [],
        title: "MSA",
        server_full_document_text: "",
        premium_full_document_text: "",
      } as never,
      guidedPro: true,
      signatureRebuilt: true,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.source).not.toBe("rebuilt_witness_block");
    expect(resolution.len).toBeGreaterThan(1500);
  });

  it("uses frozen handoff over longer stale draft_authoritative for guided Pro", () => {
    const frozen = fullGuidedCorpus();
    const staleDraft = `${frozen}\nStale appendix from server_full_document_text must not override handoff.`;
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
      bridge,
      signatureRebuilt: true,
    });
    expect(resolution.allowed).toBe(true);
    expect(resolution.source).toBe("finalized_signer_applied_guided_corpus");
    expect(fingerprintAgreementBody(resolution.corpus)).toBe(handoff.corpusHash);
  });

  it("uses paidProSourceOfTruth directly and skips short handoff fallback after acceptance", () => {
    // SoT establishment requires a substantive (≥10k) non-mislabeled corpus — pad to a real Pro body.
    const accepted = `${longOperativePad().repeat(4)}\n1. Fees. Client pays Provider $5,000.\n2. Texas law.${witnessBlock()}`;
    establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: accepted,
      pipelineSource: "server_full_draft",
      draft: {
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
        title: "Services Agreement",
      } as never,
      intakeText:
        "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    });
    const expected = getAcceptedPremiumCorpusForVs01Signing({
      draft: {
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
      } as never,
    });
    const resolution = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: SHORT_FALLBACK,
      guidedPro: true,
      freeBaselinePlain: SHORT_FALLBACK,
      draft: {
        parties: [
          { name: "Red Mesa Logistics LLC", role: "Client" },
          { name: "Harbor Peak Automation LLC", role: "Service Provider" },
        ],
      } as never,
      bridge,
    });
    expect(resolution.source).toBe("paidProSourceOfTruth");
    expect(resolution.corpus).toBe(expected);
    expect(resolution.corpus).toContain("Red Mesa Logistics LLC");
    expect(resolution.corpus).toContain("Harbor Peak Automation LLC");
    expect(resolution.hash).toBe(fingerprintAgreementBody(expected));
    expect(resolution.len).toBeGreaterThan(SHORT_FALLBACK.length * 2);
  });
});
