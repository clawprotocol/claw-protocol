/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { formatAgreementPlainTextForEditing } from "../../agreement/formatAgreementPlainTextForEditing";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  replaceAuthoritativeSigningSnapshotCorpus,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import {
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffLinear,
} from "./premiumPartyNamesHandoff";
import { resolveReviewFirstDisplayCorpus } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import { resetPaidProTest315ReviewCopyHydrationLogsForTests } from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import {
  clearReviewFirstHandoffSource,
  peekReviewFirstPinnedCorpus,
  writeReviewFirstPinnedCorpus,
} from "../../launch/simpleProduct/reviewFirstSendSurface";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test315_review_copy";

function buildUnhydratedBody() {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    "1. Scope of Services",
    "Service Provider shall perform consulting services as described in Exhibit A.",
    "",
    ...Array.from({ length: 9 }, (_, i) => `${i + 2}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
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
    recipient1Email: "bca34@me.com",
    recipient2Email: "ivs34@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["234 Rete St., Utes, UT 87432", "309 Hue Avenue, El Annuncion, NM 84593"],
  });
}

function blueIronDraft(): AgreementDraft {
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

function armHandoffOnly() {
  writePremiumRecipientHandoffLinear([
    {
      name: BLUE,
      email: "bca34@me.com",
      role: "owner",
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      partyAddress: "234 Rete St., Utes, UT 87432",
    },
    {
      name: IRON,
      email: "ivs34@me.com",
      role: "party",
      signerName: "Michael Torres",
      signerTitle: "President",
      partyAddress: "309 Hue Avenue, El Annuncion, NM 84593",
    },
  ]);
}

function armUnhydratedLockedSnapshot() {
  const authority = qaAuthority();
  const unhydrated = buildUnhydratedBody();
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: unhydrated,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({
    corpus: unhydrated,
    surface: "test315_unhydrated_regression",
  });
  clearConsumedPaidProSignerMetadataAuthority();
}

function expectHydratedExecutionBlock(text: string) {
  expect(text).toMatch(/Sarah Mitchell/i);
  expect(text).toMatch(/\bCEO\b/);
  expect(text).toMatch(/Michael Torres/i);
  expect(text).toMatch(/President/i);
  expect(text).toMatch(/bca34@me\.com/i);
  expect(text).toMatch(/ivs34@me\.com/i);
  expect(text).toMatch(/234 Rete St\./i);
  expect(text).toMatch(/309 Hue Avenue/i);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
}

describe("Test315 review-ready signer metadata hydration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearReviewFirstHandoffSource();
    resetPremiumRecipientHandoffDedupForTests();
    resetPaidProTest315ReviewCopyHydrationLogsForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("Review Link Ready display includes Sarah Mitchell / CEO and Michael Torres / President", () => {
    armUnhydratedLockedSnapshot();
    armHandoffOnly();
    const draft = blueIronDraft();
    const display = resolveReviewFirstDisplayCorpus(draft, "owner_done");
    expect(display?.source).toBe("authoritative_signing_snapshot");
    expectHydratedExecutionBlock(display?.text ?? "");
    expect(display?.text).not.toContain("CANONICAL_SOT_WITHOUT_HYDRATION");
  });

  it("Party 1 reviewer page includes the same hydrated execution block", () => {
    armUnhydratedLockedSnapshot();
    armHandoffOnly();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expectHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 2 reviewer page includes the same hydrated execution block", () => {
    armUnhydratedLockedSnapshot();
    armHandoffOnly();
    const ownerDisplay = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    const party2Display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expect(party2Display?.text).toBe(ownerDisplay?.text);
    expectHydratedExecutionBlock(party2Display?.text ?? "");
  });

  it("Copy agreement text for editing includes the same signer metadata", () => {
    armUnhydratedLockedSnapshot();
    armHandoffOnly();
    const corpus = resolveReviewFirstDisplayCorpus(blueIronDraft(), "copy_export")?.text ?? "";
    const copyText = formatAgreementPlainTextForEditing(corpus);
    expectHydratedExecutionBlock(copyText);
  });

  it("does not create a duplicate execution block", () => {
    armUnhydratedLockedSnapshot();
    armHandoffOnly();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    expect(countPaidProExecutionBlocks(display?.text ?? "")).toBe(1);
    const witnessCount = (display?.text.match(/IN WITNESS WHEREOF/gi) ?? []).length;
    expect(witnessCount).toBe(1);
  });

  it("review-link pinned corpus matches hydrated display corpus after signer metadata handoff", () => {
    armUnhydratedLockedSnapshot();
    armHandoffOnly();
    const draft = blueIronDraft();
    const hydrated = resolveReviewFirstDisplayCorpus(draft, "owner_done")!.text;
    expectHydratedExecutionBlock(hydrated);
    writeReviewFirstPinnedCorpus(AGREEMENT_ID, hydrated);
    expect(peekReviewFirstPinnedCorpus(AGREEMENT_ID)).toBe(hydrated);

    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    const pinnedOnly = resolveReviewFirstDisplayCorpus(draft, "owner_done");
    expect(pinnedOnly?.source).toBe("review_first_pinned_corpus");
    expect(pinnedOnly?.text).toBe(hydrated);
    expectHydratedExecutionBlock(pinnedOnly?.text ?? "");
  });
});
