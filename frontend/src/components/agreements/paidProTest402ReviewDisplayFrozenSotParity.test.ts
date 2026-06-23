/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { summarizePaidProDocumentBlockClassifications } from "./paidProDocumentBlockClassifier";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  preparePaidProFrozenDisplayPlain,
  preparePaidProReviewDisplayPlain,
} from "./paidProFlattenedDocumentNormalize";
import {
  buildPremiumAgreementReadonlyHtml,
  resetSignaturePreviewModeLogDedupeForTests,
} from "./premiumAgreementDocumentHtml";
import {
  applyPremiumRecipientHandoffReadGate,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import { countSignerMetadataSlots } from "./signerMetadataEffective";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { shouldSuppressCorpusEmbeddedSignatureForProReview } from "./paidProAuthoritativeRenderGate";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { buildAcceptedQuadPartyServerCorpus, padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
  test398Draft,
  test398Parties,
} from "./paidProTest398Fixtures";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { readPremiumRecipientHandoff, writePremiumRecipientHandoffLinear } from "./premiumPartyNamesHandoff";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc";

function padQuadPartyServerDraftBeforeWitness(base: string, minLen = 2000): string {
  if (base.length >= minLen) return base;
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  let pad = "";
  let i = 0;
  while (base.length + pad.length < minLen) {
    pad += `13.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith on deliverables, reporting, and acceptance milestones.\n\n`;
    i += 1;
  }
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  resetPaidProPremiumRecipientHandoffReadGateForTests();
  resetSignaturePreviewModeLogDedupeForTests();
});

describe("TEST402 — frozen SoT review display parity and signature presentation", () => {
  it("review/display stays normalize-equivalent to frozen SoT with compact quad-party signatures", () => {
    const draft = test398Draft();
    const intake = TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE;
    const raw = buildAcceptedQuadPartyServerCorpus(intake, draft);

    setConsumedPaidProSignerMetadataAuthority({
      parties: test398Parties(),
      source: "live_ui",
      hash: "test402",
      updatedAt: 0,
    });

    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    const acceptedText = padOperativeCorpusBeforeWitness(prep.text);
    markPaidProPipelineValidationPassed({ text: acceptedText, source: "server_full_draft_retry" });

    establishPaidProSourceOfTruth({
      text: acceptedText,
      source: "server_full_draft_retry",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });

    const record = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus();
    expect(frozen?.hash).toBeTruthy();
    expect(record.hash).toBe(frozen?.hash ?? record.hash);

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const frozenDisplay = preparePaidProFrozenDisplayPlain(record.text).text;
    expect(hashPaidProCorpus(frozenDisplay)).toBe(hashPaidProCorpus(reviewPlain));

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain });
    expect(parity.invariantOk).toBe(true);
    expect(parity.signerFieldOnlyDelta).toBe(true);

    expect(reviewPlain).not.toMatch(/Section The Clients/i);
    expect(reviewPlain).not.toMatch(/3\.5 Joint\s*\n\s*Client Payment Responsibility/i);
    expect(reviewPlain).toMatch(new RegExp(BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect((reviewPlain.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);

    const summary = summarizePaidProDocumentBlockClassifications(reviewPlain);
    expect(summary.signatureEntityCount).toBe(4);
    expect(summary.titleCount).toBe(1);

    const htmlEmbedded = buildPremiumAgreementReadonlyHtml(reviewPlain, {
      signatureSectionMode: "collaboration",
      partyNames: [RED, BLUE, HARBOR, IRON],
      intakeText: intake,
    });
    expect(htmlEmbedded).toContain('class="premium-doc-signature-entity-name"');
    expect(htmlEmbedded).not.toMatch(/<h1>RED MESA LOGISTICS LLC<\/h1>/i);

    const htmlStripped = buildPremiumAgreementReadonlyHtml(reviewPlain, {
      signatureSectionMode: "collaboration",
      partyNames: [RED, BLUE, HARBOR, IRON],
      intakeText: intake,
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(htmlStripped).not.toContain("premium-doc-signature-entity-name");
    expect(htmlStripped).not.toMatch(/IN WITNESS WHEREOF/i);

    expect(
      shouldSuppressCorpusEmbeddedSignatureForProReview({
        paidProAuthoritative: true,
        paidProInlineSignerSetupLatched: true,
      }),
    ).toBe(true);

    writePremiumRecipientHandoffLinear(
      test398Parties().map((party) => ({
        name: party.partyLegalName,
        email: party.signerEmail,
        role: "party",
        signerName: party.signerName,
        signerTitle: party.signerTitle,
        partyAddress: party.partyAddress,
      })),
    );
    const emptyRead = applyPremiumRecipientHandoffReadGate(readPremiumRecipientHandoff(), {
      corpusHash: record.hash,
    });
    const handoffCounts = countSignerMetadataSlots(emptyRead, 4);
    expect(handoffCounts.partySlots).toBe(4);

    const vs01Count = consumeAuthoritativeSignerCount("test402", {
      intakeText: intake,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: reviewPlain,
    });
    expect(vs01Count).toBe(4);

    const vs01 = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: reviewPlain,
      draft: { parties: draft.parties.map((p) => ({ name: p.name })) } as never,
      intakeText: intake,
      premiumAccepted: true,
      premiumComplete: true,
      guidedPro: true,
    });
    expect(vs01.allowed).toBe(true);
    expect(vs01.signerCount).toBe(4);

    expect(preparePaidProReviewDisplayPlain(record.text, { frozenDisplayOnly: true }).text).toBe(
      frozenDisplay,
    );
  });
});
