/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { commitPaidProPostFinalizeClauseEditRevision } from "./paidProPostFinalizeEditSave";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import {
  auditPaidProReviewLinkCorpusParity,
  resolvePaidProReviewLinkCorpusPlain,
} from "./paidProReviewLinkCorpusParity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { clearPaidProPinnedSignerAppliedCorpus, setPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { resolveReviewFirstDisplayCorpus, applyReviewTrackDisplayFormatting } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  clearReviewFirstHandoffSource,
  peekReviewFirstPinnedCorpus,
  writeReviewFirstPinnedCorpus,
} from "../../launch/simpleProduct/reviewFirstSendSurface";
import { buildRecipientAccessMintBody } from "../../agreement/recipientAccessMintPayload";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test304_review_link";

function buildFreezeBody(paymentDays: string) {
  return [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    `Section 4. Payment. Client shall pay within ${paymentDays} days of invoice.`,
    "",
    ...Array.from({ length: 16 }, (_, i) => `Section ${i + 5}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `PARTY: ${BLUE}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    `PARTY: ${IRON}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");
}

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "BCA45@me.com",
    recipient2Email: "Huntme45@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["23 Edge St.", "345 Fist Ave."],
  });
}

function armFinalizeSnapshot(hydratedCorpus: string) {
  const authority = qaAuthority();
  setConsumedPaidProSignerMetadataAuthority(authority);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydratedCorpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  setPaidProPinnedSignerAppliedCorpus(hydratedCorpus);
}

function draftWithStaleReviewFallback(): AgreementDraft {
  return {
    id: AGREEMENT_ID,
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: BLUE, role: "owner" },
      { id: "p2", name: IRON, role: "party" },
    ],
    purpose: "short starter fallback",
    payment_terms: "premium",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    premium_render_source: "review_first_final_corpus",
    server_full_document_text: "CANONICAL_SOT_WITHOUT_HYDRATION",
    pro_redline_v1: {
      review_first_final_corpus: { text: "STALE_REVIEW_CORPUS" },
    },
  };
}

describe("Test304 review link uses post-finalize signing snapshot", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearReviewFirstHandoffSource();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("review link corpus equals post-finalize snapshot after clause edit; 15-day + signer metadata preserved", () => {
    const freezeBody = buildFreezeBody("thirty (30)");
    establishPaidProSourceOfTruth({
      text: freezeBody,
      source: "server_full_draft",
      intakeText: "consulting between Blue Canyon and Iron Vale",
    });
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: freezeBody,
      authority,
      intakeRaw: "",
      surface: "test304_finalize",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus);

    const edited = hydrated.corpus.replace("thirty (30) days", "fifteen (15) days");
    const saved = commitPaidProPostFinalizeClauseEditRevision({ editedPlain: edited });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const creatorPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(creatorPlain).toMatch(/fifteen \(15\) days/i);
    expect(creatorPlain).toMatch(/Sarah Mitchell/i);
    expect(creatorPlain).toMatch(/Michael Torres/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(creatorPlain)).toBe(0);
    expect(countPaidProExecutionBlocks(creatorPlain)).toBe(1);

    const linkCorpus = resolvePaidProReviewLinkCorpusPlain();
    expect(linkCorpus).not.toBeNull();
    expect(linkCorpus?.source).toBe("authoritative_signing_snapshot");
    expect(linkCorpus?.plain).toBe(creatorPlain);

    writeReviewFirstPinnedCorpus(AGREEMENT_ID, linkCorpus!.plain);
    const pinned = peekReviewFirstPinnedCorpus(AGREEMENT_ID);
    expect(pinned).toBe(creatorPlain);

    const parity = auditPaidProReviewLinkCorpusParity({
      creatorPlain,
      reviewLinkPlain: pinned!,
      source: "authoritative_signing_snapshot",
    });
    expect(parity.invariantOk).toBe(true);
    expect(parity.creatorHash).toBe(parity.reviewLinkHash);
    expect(parity.hydrated).toBe(true);
    expect(parity.blankSignerLinesRemaining).toBe(0);

    const display = resolveReviewFirstDisplayCorpus(draftWithStaleReviewFallback());
    expect(display?.source === "authoritative_signing_snapshot" || display?.source === "review_first_pinned_corpus").toBe(true);
    const expectedDisplayText = applyReviewTrackDisplayFormatting(creatorPlain);
    expect(display?.text).toBe(expectedDisplayText);
    expect(display?.hash).toBe(hashPaidProCorpus(expectedDisplayText));
    expect(display?.text).toMatch(/fifteen \(15\) days/i);
    expect(display?.text).toMatch(/Sarah Mitchell/i);
    expect(display?.text).not.toContain("CANONICAL_SOT_WITHOUT_HYDRATION");

    const mintBody = buildRecipientAccessMintBody({
      mode: "review",
      role: "reviewer",
      review_first_document_text: pinned!,
      review_first_document_source: "authoritative_signing_snapshot",
    });
    expect(mintBody.review_first_document_text).toBe(creatorPlain);
    expect(hashPaidProCorpus(String(mintBody.review_first_document_text))).toBe(parity.reviewLinkHash);
  });
});
