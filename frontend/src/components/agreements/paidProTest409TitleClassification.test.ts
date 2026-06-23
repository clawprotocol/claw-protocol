/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHydratedAuthoritativeSigningCorpusFromAuthority,
} from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  classifyPaidProDocumentBlocks,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
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
  test407LiveUiWithBlankExtraLegalNames,
} from "./paidProTest407Fixtures";
import {
  projectPaidProVisibleTitleDisplayPlain,
} from "./paidProDocumentTitleOpeningRepair";
import {
  resolveCanonicalPlainForVisibleShell,
  resetPaidProVisibleDocumentShellLogsForTests,
} from "./paidProVisibleDocumentShell";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import { preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

function buildTest409ProductionOpening(base: string): string {
  return base.replace(
    /^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement is entered into by and among/m,
    [
      'MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT (the "Agreement") is entered into by and among',
      `${RED} ("Red Mesa"), ${BLUE} ("Blue Canyon"), ${HARBOR} ("Harbor Peak"), and ${IRON} ("Iron Vale") (each a "Party" and collectively, the "Parties");`,
    ].join("\n"),
  );
}

function padBeforeWitness(base: string, minLen = 2000): string {
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
  clearAuthoritativeSigningSnapshot();
  resetPaidProVisibleDocumentShellLogsForTests();
  vi.restoreAllMocks();
});

describe("TEST409 — chronic Pro title classification on review and post-finalize paths", () => {
  it("repairs production-style glued title on first-review and visible-shell paths", () => {
    const draft = test407Draft();
    const intake = TEST407_PRODUCTION_QUAD_PARTY_INTAKE;
    const raw = padOperativeCorpusBeforeWitness(
      buildTest409ProductionOpening(buildAcceptedQuadPartyServerCorpus(intake, draft)),
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

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const shellPlain = resolveCanonicalPlainForVisibleShell({
      draft,
      intakeText: intake,
      paidProActive: true,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
    }).plain;

    expect(sectionRenderSpy).not.toHaveBeenCalled();
    expect(reviewPlain).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement/m);
    expect(reviewPlain).not.toMatch(/MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i);
    expect(summarizePaidProDocumentBlockClassifications(reviewPlain).titleCount).toBe(1);
    expect(summarizePaidProDocumentBlockClassifications(shellPlain).titleCount).toBe(1);
    expect(classifyPaidProDocumentBlocks(shellPlain)[0]?.kind).toBe("document_title");

    const html = buildPremiumAgreementReadonlyHtml(shellPlain, {
      surface: "test409_first_review",
      signatureSectionMode: "collaboration",
      partyNames: [RED, BLUE, HARBOR, IRON],
    });
    expect(html).toMatch(/<h1[^>]*>\s*MUTUAL SERVICES AGREEMENT\s*<\/h1>/i);

    const record = getPaidProSourceOfTruth()!;
    const frozenDisplay = preparePaidProFrozenDisplayPlain(record.text).text;
    expect(hashPaidProCorpus(frozenDisplay)).toBe(hashPaidProCorpus(reviewPlain));

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: shellPlain, intakeText: intake, draft });
    expect(parity.invariantOk).toBe(true);
  });

  it("repairs production-style glued title on authoritative signing snapshot display path", () => {
    const draft = test407Draft();
    const intake = TEST407_PRODUCTION_QUAD_PARTY_INTAKE;
    const raw = padOperativeCorpusBeforeWitness(
      buildTest409ProductionOpening(buildAcceptedQuadPartyServerCorpus(intake, draft)),
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

    const authority = buildPaidProSignerMetadataAuthorityForFinalize(test407LiveUiWithBlankExtraLegalNames(), {
      intakeText: intake,
      draftPartyNames: [RED, BLUE],
    });
    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: acceptedText,
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);

    const gluedCorpus = buildTest409ProductionOpening(hydrated.corpus);
    const projected = projectPaidProVisibleTitleDisplayPlain(gluedCorpus);

    expect(projected).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement/m);
    expect(projected).not.toMatch(/MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i);
    expect(summarizePaidProDocumentBlockClassifications(projected).titleCount).toBe(1);

    createAuthoritativeSigningSnapshot({
      corpus: gluedCorpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, { intakeText: intake }),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: authorityPartiesToCanonicalPartyIdentities(authority.parties, { intakeText: intake }),
        signFirst: true,
      }),
      intakeText: intake,
      authorityParties: authority.parties,
    });

    const shellPlain = resolveCanonicalPlainForVisibleShell({
      draft,
      intakeText: intake,
      paidProActive: true,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
    }).plain;
    expect(summarizePaidProDocumentBlockClassifications(shellPlain).titleCount).toBe(1);
    expect(shellPlain).not.toMatch(/MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i);
  });
});
