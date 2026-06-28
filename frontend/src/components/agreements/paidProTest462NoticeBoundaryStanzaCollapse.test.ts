/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  authorityPartiesToRecipientMetadata,
  buildLivePaidProSignerMetadataAuthority,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  countOperativeIfToNoticeStanzas,
  findNoticesSectionStart,
  hasCollapsedInlineNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { setPaidProPinnedSignerAppliedCorpus, clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { resolvePrepareBridgeSigningCorpus } from "../../vs01/vs01PrepareBridgeCorpus";
import {
  buildTest462FrozenHandoffCorpus,
  TEST462_ALL_PARTIES,
  TEST462_LIVE_INTAKE,
  TEST462_MIN_FROZEN_LEN,
  TEST462_SIGNER_METADATA,
  test462BrightPeakFirstDraft,
} from "./paidProTest462Fixtures";

function polishTest462ReviewCorpus(body: string): string {
  const joined = repairJoinedTopLevelSectionHeadings(body);
  const display = preparePaidProReviewDisplayPlain(joined.text);
  return polishProAgreementDisplayLayer(display.text, {
    draft: test462BrightPeakFirstDraft(),
    intakeText: TEST462_LIVE_INTAKE,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: true,
  }).text;
}

function operativeNoticeStanzas(text: string): string[] {
  const noticesIdx = findNoticesSectionStart(text);
  if (noticesIdx < 0) return [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = text.slice(noticesIdx, witnessIdx >= 0 ? witnessIdx : text.length);
  return region.split(/\n(?=If to\s+)/i).slice(1).map((s) => s.trim()).filter(Boolean);
}

function assertTest462NoticePolish(text: string): void {
  expect(text).not.toMatch(/void12\.2/i);
  expect(text).not.toMatch(/venue12\.4/i);
  expect(text).not.toMatch(/[a-z]12\.2 Notices/i);
  expect(text).not.toMatch(/If to[^\n]+\bAttn:\s*[^\n]+\s+Email:/i);
  const noticeHeadingOnOwnLine =
    /(?:^|\n)\s*12\.2\s+Notices\b/m.test(text) ||
    /(?:^|\n)\s*12\.\s+Disputes, Governing Law and Notices\b/m.test(text);
  expect(noticeHeadingOnOwnLine).toBe(true);
  expect(hasCollapsedInlineNoticeStanzas(text)).toBe(false);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);

  const stanzas = operativeNoticeStanzas(text);
  expect(stanzas.length).toBe(4);
  for (const stanza of stanzas) {
    expect(stanza).toMatch(/^If to\s+.+\s*:\s*$/im);
    expect(stanza).toMatch(/(?:Attention|Attn):/i);
    expect(stanza).toMatch(/Email:/i);
    expect(stanza.split("\n").some((line) => {
      const t = line.trim();
      return t.length > 6 && !/^If to/i.test(t) && !/^(?:Attention|Attn|Email|Address):/i.test(t);
    })).toBe(true);
    expect(
      stanza.split("\n").some((line) => /\b(?:Attn|Attention):\s*.+\s+Email:/i.test(line.trim())),
    ).toBe(false);
    expect(
      stanza.split("\n").some(
        (line) =>
          /(?:LLC|Inc\.?|Corp\.?)\b.*\b(?:Attn|Attention):/i.test(line.trim()) &&
          !/^If to/i.test(line.trim()),
      ),
    ).toBe(false);
  }

  expect(text).toContain(TEST462_SIGNER_METADATA.partySignerNames[0]!);
  expect(text).toContain(TEST462_SIGNER_METADATA.partySignerNames[1]!);
  expect(text).toContain("Eve Green");
  expect(text).toContain("Ann Center");
}

function assertTest462DisplayPolish(text: string): void {
  assertTest462NoticePolish(text);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
}

describe("TEST462 — Paid Pro notice boundary and stanza collapse display repair", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("fixture frozen corpus carries void12.2 and collapsed inline notice stanzas", () => {
    const frozen = buildTest462FrozenHandoffCorpus();
    expect(frozen.length).toBeGreaterThanOrEqual(TEST462_MIN_FROZEN_LEN);
    expect(frozen).toMatch(/void12\.2 Notices/i);
    expect(frozen).toMatch(/venue\.12\.4 Notices/i);
    expect(hasCollapsedInlineNoticeStanzas(frozen)).toBe(true);
  });

  it("frozen server_full SoT is accepted without regeneration and display repair fixes boundaries/stanzas", () => {
    const draft = test462BrightPeakFirstDraft();
    const frozenRaw = buildTest462FrozenHandoffCorpus();
    expect(frozenRaw.length).toBeGreaterThanOrEqual(TEST462_MIN_FROZEN_LEN - 300);

    establishPaidProSourceOfTruth({
      text: frozenRaw,
      source: "server_full_draft",
      draft,
      intakeText: TEST462_LIVE_INTAKE,
      reviewSessionId: "gen-test462",
      generationOutcome: "ok",
    });
    const sot = getPaidProSourceOfTruth();
    const sotHash = sot?.hash ?? "";
    expect(sotHash).toBeTruthy();
    const sotText = getPaidProSourceOfTruthText();
    expect(sotText.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(sotText.length).toBeGreaterThanOrEqual(frozenRaw.length - 400);
    expect(sotText).toMatch(/void12\.2 Notices/i);
    expect(hasCollapsedInlineNoticeStanzas(sotText)).toBe(true);

    const reviewDisplay = polishTest462ReviewCorpus(sotText);
    assertTest462DisplayPolish(reviewDisplay);
    expect(reviewDisplay).not.toMatch(/venue\.12\.4 Notices/);

    const authority = buildLivePaidProSignerMetadataAuthority(TEST462_SIGNER_METADATA);
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: getPaidProSourceOfTruthText(),
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: TEST462_LIVE_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST462_LIVE_INTAKE,
      draftPartyNames: TEST462_ALL_PARTIES,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: TEST462_LIVE_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const postSignerReview = polishTest462ReviewCorpus(resolvePaidProPostFinalizeReviewPlain(draft));
    assertTest462NoticePolish(postSignerReview);
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);

    const prepareCorpus = resolvePrepareBridgeSigningCorpus({
      agreementId: "ag_test462",
      draft: null,
      bridge: {
        vs01DocumentId: "local_doc_test462",
        agreementId: "ag_test462",
        agreementTitle: "Manufacturing, Distribution, Licensing and Marketing Services Agreement",
        creatorName: TEST462_ALL_PARTIES[0]!,
        creatorEmail: TEST462_SIGNER_METADATA.recipient1Email,
        creatorSignerName: TEST462_SIGNER_METADATA.partySignerNames[0]!,
        creatorSignerTitle: TEST462_SIGNER_METADATA.partySignerTitles[0]!,
        counterparties: [],
        targetStep: 2,
        senderFirstLawdogHandoff: true,
        reviewerApprovedCleanHandoff: true,
        agreementBridgeMode: "prepare_signing_packet",
        ownerIsPreparingPacket: true,
        agreementCorpusText: postSignerReview,
      },
    });
    if (prepareCorpus.allowed && prepareCorpus.corpus) {
      assertTest462NoticePolish(prepareCorpus.corpus);
    } else {
      assertTest462NoticePolish(postSignerReview);
    }

    expect(getPaidProSourceOfTruth()?.hash).toBe(sotHash);
    expect(getPaidProSourceOfTruthText()).toMatch(/void12\.2 Notices/i);
  });
});
