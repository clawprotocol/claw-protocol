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
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffLinear,
} from "./premiumPartyNamesHandoff";
import { resolveReviewFirstDisplayCorpus } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  countBlankAddressLinesInExecutionBlock,
  extractPartyAddressesFromExecutionBlockCorpus,
  resetPaidProTest315ReviewCopyHydrationLogsForTests,
  resolveReviewReadyRecipientMetadata,
} from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import { clearReviewFirstHandoffSource } from "../../launch/simpleProduct/reviewFirstSendSurface";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test317_reviewer_address";
const BLUE_ADDRESS = "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89333";
const IRON_ADDRESS = "24 Rete Ave., Hunter, AL 73456";

function buildFullyHydratedBody() {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: bca894@gmail.com",
    `Address for Notice: ${BLUE_ADDRESS}`,
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: fdg34@gmail.com",
    `Address for Notice: ${IRON_ADDRESS}`,
    "Date: _____________________________",
  ].join("\n");
}

/** Reviewer-route corpus: names/titles/emails present, address lines omitted. */
function buildReviewerRoutePartialBody() {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: bca894@gmail.com",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: fdg34@gmail.com",
    "Date: _____________________________",
  ].join("\n");
}

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "bca894@gmail.com",
    recipient2Email: "fdg34@gmail.com",
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

/** Stale handoff: names/titles/emails only — no partyAddress (TEST317 regression). */
function armHandoffWithoutAddresses() {
  writePremiumRecipientHandoffLinear([
    {
      name: BLUE,
      email: "bca894@gmail.com",
      role: "owner",
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
    },
    {
      name: IRON,
      email: "fdg34@gmail.com",
      role: "party",
      signerName: "Michael Torres",
      signerTitle: "President",
    },
  ]);
}

function armReviewerRouteRegressionFixture() {
  const authority = qaAuthority();
  const fullHydrated = buildFullyHydratedBody();
  const partial = buildReviewerRoutePartialBody();
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);

  createAuthoritativeSigningSnapshot({
    corpus: fullHydrated,
    signerMetadata: {
      ...authorityPartiesToRecipientMetadata(authority.parties),
      partyAddresses: ["", ""],
    },
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({
    corpus: partial,
    surface: "test317_reviewer_partial_corpus",
  });
  setPaidProPinnedSignerAppliedCorpus(fullHydrated);
  clearConsumedPaidProSignerMetadataAuthority();
}

function expectFullyHydratedExecutionBlock(text: string) {
  expect(text).toMatch(/Sarah Mitchell/i);
  expect(text).toMatch(/\bCEO\b/);
  expect(text).toMatch(/Michael Torres/i);
  expect(text).toMatch(/President/i);
  expect(text).toMatch(/bca894@gmail\.com/i);
  expect(text).toMatch(/fdg34@gmail\.com/i);
  expect(text).toContain(BLUE_ADDRESS);
  expect(text).toContain(IRON_ADDRESS);
  expect(countBlankAddressLinesInExecutionBlock(text)).toBe(0);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
}

describe("Test317 reviewer address carryover", () => {
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

  it("extracts addresses from finalized /app/create corpus by legal entity name", () => {
    const full = buildFullyHydratedBody();
    const extracted = extractPartyAddressesFromExecutionBlockCorpus(full);
    expect(extracted.size).toBeGreaterThanOrEqual(2);
    const values = [...extracted.values()];
    expect(values.some((v) => v.includes("1027 S. Rainbow"))).toBe(true);
    expect(values.some((v) => v.includes("24 Rete Ave"))).toBe(true);
  });

  it("merges addresses from pinned full corpus when handoff lacks partyAddress", () => {
    armReviewerRouteRegressionFixture();
    armHandoffWithoutAddresses();
    const draft = blueIronDraft();
    const meta = resolveReviewReadyRecipientMetadata(draft, {
      corpusHints: [buildFullyHydratedBody()],
    });
    expect(meta?.partyAddresses?.[0]).toContain("1027 S. Rainbow");
    expect(meta?.partyAddresses?.[1]).toContain("24 Rete Ave");
  });

  it("Review Link Ready includes both Address for Notice lines", () => {
    armReviewerRouteRegressionFixture();
    armHandoffWithoutAddresses();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    expect(display?.source).toBe("authoritative_signing_snapshot");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 1 reviewer page includes both addresses", () => {
    armReviewerRouteRegressionFixture();
    armHandoffWithoutAddresses();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 2 reviewer page includes both addresses", () => {
    armReviewerRouteRegressionFixture();
    armHandoffWithoutAddresses();
    const ownerDisplay = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    const party2Display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expect(party2Display?.text).toBe(ownerDisplay?.text);
    expectFullyHydratedExecutionBlock(party2Display?.text ?? "");
  });

  it("copy agreement text includes both addresses without blank address lines", () => {
    armReviewerRouteRegressionFixture();
    armHandoffWithoutAddresses();
    const corpus = resolveReviewFirstDisplayCorpus(blueIronDraft(), "copy_export")?.text ?? "";
    const copyText = formatAgreementPlainTextForEditing(corpus);
    expectFullyHydratedExecutionBlock(copyText);
  });

  it("preserves exactly one execution block", () => {
    armReviewerRouteRegressionFixture();
    armHandoffWithoutAddresses();
    const text = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer")?.text ?? "";
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect((text.match(/IN WITNESS WHEREOF/gi) ?? []).length).toBe(1);
  });
});
