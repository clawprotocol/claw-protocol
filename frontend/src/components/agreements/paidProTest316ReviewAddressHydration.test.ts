/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { formatAgreementPlainTextForEditing } from "../../agreement/formatAgreementPlainTextForEditing";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
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
import {
  corpusHasHydratedSignerNamesTitlesEmails,
  countBlankAddressLinesInExecutionBlock,
  resetPaidProTest315ReviewCopyHydrationLogsForTests,
  resolveReviewReadyRecipientMetadata,
} from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import { clearReviewFirstHandoffSource } from "../../launch/simpleProduct/reviewFirstSendSurface";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test316_review_address";
const BLUE_ADDRESS = "1027 S. Rainbow Blvd., #124, Junte, NH 04583";
const IRON_ADDRESS = "27485 Reconstitution Ave., Laine Way, IN 27485";

/** Names/titles/emails hydrated but Address for Notice lines omitted — TEST316 regression shape. */
function buildPartiallyHydratedBody() {
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
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: bca34@gmail.com",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: ivs73@gmail.com",
    "Date: _____________________________",
  ].join("\n");
}

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "bca34@gmail.com",
    recipient2Email: "ivs73@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [BLUE_ADDRESS, IRON_ADDRESS],
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
      email: "bca34@gmail.com",
      role: "owner",
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      partyAddress: BLUE_ADDRESS,
    },
    {
      name: IRON,
      email: "ivs73@gmail.com",
      role: "party",
      signerName: "Michael Torres",
      signerTitle: "President",
      partyAddress: IRON_ADDRESS,
    },
  ]);
}

function armPartiallyHydratedLockedSnapshot() {
  const authority = qaAuthority();
  const partial = buildPartiallyHydratedBody();
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: partial,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({
    corpus: partial,
    surface: "test316_partial_address_regression",
  });
  clearConsumedPaidProSignerMetadataAuthority();
}

function expectFullyHydratedExecutionBlock(text: string) {
  expect(text).toMatch(/Sarah Mitchell/i);
  expect(text).toMatch(/\bCEO\b/);
  expect(text).toMatch(/Michael Torres/i);
  expect(text).toMatch(/President/i);
  expect(text).toMatch(/bca34@gmail\.com/i);
  expect(text).toMatch(/ivs73@gmail\.com/i);
  expect(text).toContain(BLUE_ADDRESS);
  expect(text).toContain(IRON_ADDRESS);
  expect(countBlankAddressLinesInExecutionBlock(text)).toBe(0);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
}

describe("Test316 review-ready address hydration", () => {
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

  it("Review Link Ready corpus preserves both Address for Notice lines after signer finalize", () => {
    armPartiallyHydratedLockedSnapshot();
    const partial = readAuthoritativeSigningCorpus();
    expect(partial).toMatch(/Sarah Mitchell/i);
    armHandoffOnly();
    const draft = blueIronDraft();
    const meta = resolveReviewReadyRecipientMetadata(draft);
    expect(corpusHasHydratedSignerNamesTitlesEmails(partial, meta)).toBe(true);
    expect(meta?.partyAddresses?.[0]).toContain("1027");
    expect(meta?.partyAddresses?.[1]).toContain("27485");
    const display = resolveReviewFirstDisplayCorpus(draft, "owner_done");
    expect(display?.source).toBe("authoritative_signing_snapshot");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 1 reviewer page preserves both addresses", () => {
    armPartiallyHydratedLockedSnapshot();
    armHandoffOnly();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 2 reviewer page preserves both addresses", () => {
    armPartiallyHydratedLockedSnapshot();
    armHandoffOnly();
    const ownerDisplay = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    const party2Display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expect(party2Display?.text).toBe(ownerDisplay?.text);
    expectFullyHydratedExecutionBlock(party2Display?.text ?? "");
  });

  it("Copy agreement text preserves both addresses", () => {
    armPartiallyHydratedLockedSnapshot();
    armHandoffOnly();
    const corpus = resolveReviewFirstDisplayCorpus(blueIronDraft(), "copy_export")?.text ?? "";
    const copyText = formatAgreementPlainTextForEditing(corpus);
    expectFullyHydratedExecutionBlock(copyText);
  });

  it("keeps exactly one execution block and preserves names/titles/emails", () => {
    armPartiallyHydratedLockedSnapshot();
    armHandoffOnly();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    const text = display?.text ?? "";
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect((text.match(/IN WITNESS WHEREOF/gi) ?? []).length).toBe(1);
    expect(text).toMatch(/Sarah Mitchell/i);
    expect(text).toMatch(/Michael Torres/i);
    expect(text).toMatch(/bca34@gmail\.com/i);
    expect(text).toMatch(/ivs73@gmail\.com/i);
  });
});
