import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { shouldStagePaidProSignerMetadataLocally } from "./paidProSignerMetadataCommitPolicy";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { resetGuidedFinalReviewAuthoritativeBodyLogDedupeForTests } from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";
import { resetSignaturePreviewModeLogDedupeForTests } from "./premiumAgreementDocumentHtml";
import * as authoritativeSignerHydration from "./authoritativeSignerHydration";

const FIXTURE = readFileSync(
  join(__dirname, "qa/paidProHardening/fixtures/freeProQaTemplateATest204.txt"),
  "utf8",
).trim();

const LIVE_UI = {
  partyCount: 2,
  recipient1Name: "Blue Canyon Analytics LLC",
  recipient2Name: "Iron Vale Systems Inc.",
  recipient1Email: "signer1@example.com",
  recipient2Email: "signer2@example.com",
  extraPartyReviewEmails: [] as string[],
  partySignerNames: ["Anthem H Blanchard", "Vee Gee"],
  partySignerTitles: ["Member", "Member"],
  partyAddresses: ["1027 S. Rainbow Blvd., #124, Las Vegas, NV 89146", "111 Main St"],
};

describe("paidPro signature block display polish (Test217)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    resetGuidedFinalReviewAuthoritativeBodyLogDedupeForTests();
    resetSignaturePreviewModeLogDedupeForTests();
  });

  it("hydrated execution block keeps exactly one execution region and blank Date lines in plain corpus", () => {
    establishPaidProSourceOfTruth({ text: FIXTURE, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority(LIVE_UI);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority,
      intakeRaw: "mutual consulting agreement",
      surface: "test217_hydrate",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).toBe(false);
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).toMatch(/Date:\s*_{3,}/i);
    expect(hydrated.corpus).not.toMatch(/Date:\s*\d{1,2}\/\d{1,2}\/\d{2,4}/);

    const plainBefore = hydrated.corpus;
    const html = buildPremiumAgreementReadonlyHtml(plainBefore, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
      forceEmbeddedCorpusSignature: true,
    });
    expect(hydrated.corpus).toBe(plainBefore);
    expect(html).not.toContain("premium-doc-hydrated-value");
    expect(html).toMatch(/Name:\s*Anthem H Blanchard/);
  });

  it("copy/review plain resolver matches pre-HTML corpus after display build", () => {
    establishPaidProSourceOfTruth({ text: FIXTURE, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority(LIVE_UI);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruthText(),
      authority,
      intakeRaw: "",
      surface: "test217_copy_parity",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties, []),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
    });
    const reviewPlain = resolvePaidProReviewRenderPlain();
    buildPremiumAgreementReadonlyHtml(reviewPlain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
      forceEmbeddedCorpusSignature: true,
    });
    expect(resolvePaidProReviewRenderPlain()).toBe(reviewPlain);
  });

  it("staged signer typing does not call hydration builder before finalize", () => {
    vi.spyOn(authoritativeSignerHydration, "buildHydratedAuthoritativeSigningCorpusFromAuthority");
    establishPaidProSourceOfTruth({ text: FIXTURE, source: "server_full_draft" });
    expect(
      shouldStagePaidProSignerMetadataLocally({ signerMetadataSessionActive: true }),
    ).toBe(true);
    const first = resolvePaidProReviewRenderPlain();
    const second = resolvePaidProReviewRenderPlain();
    expect(second).toBe(first);
    expect(
      authoritativeSignerHydration.buildHydratedAuthoritativeSigningCorpusFromAuthority,
    ).not.toHaveBeenCalled();
  });

  it("PremiumAgreementReadonlyView styles omit hydrated-value bold class", () => {
    const css = readFileSync(join(__dirname, "PremiumAgreementReadonlyView.tsx"), "utf8");
    expect(css).not.toContain("premium-doc-hydrated-value");
    expect(css).toContain("premium-doc-signature-field");
    expect(css).toMatch(/premium-doc-signature-field[\s\S]*font-weight:400/);
  });
});
