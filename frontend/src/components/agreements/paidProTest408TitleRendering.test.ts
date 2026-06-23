/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyPaidProDocumentBlocks,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  needsPaidProDocumentTitleOpeningRepair,
  repairPaidProDocumentTitleOpening,
} from "./paidProDocumentTitleOpeningRepair";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import {
  clearConsumedPaidProSignerMetadataAuthority,
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
  TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
  test407Draft,
} from "./paidProTest407Fixtures";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

function buildCollapsedTitleOpening(): string {
  return [
    "MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This Mutual Services Agreement (this \"Agreement\") is entered into by and among",
    `${RED} ("Red Mesa"), ${BLUE} ("Blue Canyon"), ${HARBOR} ("Harbor Peak"), and ${IRON} ("Iron Vale") (each a "Party" and collectively, the "Parties").`,
    "",
    "1. Services and Engagement",
    "Each party provides services in good faith.",
    "",
    "3.6 Payment Responsibility of",
    "Clients.",
    `${RED} and ${BLUE} are jointly responsible for Provider fees.`,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "RED MESA LOGISTICS LLC",
    "By: _____________________________",
    "Name: Joe Doe",
    "Title: CEO",
  ].join("\n");
}

function padBeforeWitness(base: string, minLen = 1800): string {
  if (base.length >= minLen) return base;
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  let pad = "";
  let i = 0;
  while (base.length + pad.length < minLen) {
    pad += `13.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith.\n\n`;
    i += 1;
  }
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
  vi.restoreAllMocks();
});

describe("TEST408 — Pro agreement title rendering and opening collapse repair", () => {
  it("repairs collapsed title/recital openings into a standalone classified title block", () => {
    const collapsed = buildCollapsedTitleOpening();
    expect(needsPaidProDocumentTitleOpeningRepair(collapsed)).toBe(true);
    expect(summarizePaidProDocumentBlockClassifications(collapsed).titleCount).toBe(0);

    const repaired = repairPaidProDocumentTitleOpening(collapsed);
    expect(repaired.repairs).toContain("display:repair_collapsed_title_opening");
    expect(repaired.text).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement/m);
    expect(repaired.text).not.toMatch(
      /MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i,
    );

    const summary = summarizePaidProDocumentBlockClassifications(repaired.text);
    expect(summary.titleCount).toBe(1);

    const html = buildPremiumAgreementReadonlyHtml(repaired.text, {
      surface: "test408_title_render",
      signatureSectionMode: "collaboration",
      partyNames: [RED, BLUE, HARBOR, IRON],
    });
    expect(html).toMatch(/<h1[^>]*>\s*MUTUAL SERVICES AGREEMENT\s*<\/h1>/i);
    expect(html).not.toMatch(/<h1[^>]*>MUTUAL SERVICES AGREEMENT This/i);
  });

  it("keeps frozen review display parity-safe without section-render normalization on locked path", () => {
    const draft = test407Draft();
    const intake = TEST407_PRODUCTION_QUAD_PARTY_INTAKE;
    let raw = buildAcceptedQuadPartyServerCorpus(intake, draft, 1800);
    raw = raw.replace(
      /^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement is entered into by and among/m,
      [
        "MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This Mutual Services Agreement (this \"Agreement\") is entered into by and among",
        `${RED}, ${BLUE}, ${HARBOR}, and ${IRON}.`,
      ].join("\n"),
    );
    raw = raw.replace(
      "3. PAYMENT AND CONSIDERATION",
      "3. Payment and\nConsideration",
    );

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
    expect(getFrozenCanonicalAgreementCorpus()?.hash).toBeTruthy();

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const frozenDisplay = preparePaidProFrozenDisplayPlain(record.text).text;

    expect(sectionRenderSpy).not.toHaveBeenCalled();
    expect(summarizePaidProDocumentBlockClassifications(reviewPlain).titleCount).toBe(1);
    expect(reviewPlain).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis /m);
    expect(reviewPlain).not.toMatch(
      /MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i,
    );
    expect(reviewPlain).not.toMatch(/3\. Payment and\s*\n\s*Consideration/i);
    expect(reviewPlain).toMatch(/3\. PAYMENT AND CONSIDERATION/i);

    expect(hashPaidProCorpus(frozenDisplay)).toBe(hashPaidProCorpus(reviewPlain));

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain, intakeText: intake, draft });
    expect(parity.invariantOk).toBe(true);

    const blocks = classifyPaidProDocumentBlocks(reviewPlain);
    expect(blocks[0]?.kind).toBe("document_title");
    expect(blocks[0]?.firstLine).toBe("MUTUAL SERVICES AGREEMENT");
  });
});
