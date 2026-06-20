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
  collectFinalizedCorpusHintsFromDraft,
  countBlankExecutionMetadataLines,
  executionBlockMissingAddressCarryover,
  resetPaidProTest315ReviewCopyHydrationLogsForTests,
  resolveReviewReadyRecipientMetadata,
} from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import { clearReviewFirstHandoffSource } from "../../launch/simpleProduct/reviewFirstSendSurface";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test319_reviewer_execution_metadata";
const BLUE_ADDRESS = "13 Firestane Ave., Billings, MT 65323";
const IRON_ADDRESS = "934 Tree Trunk Blvd., Humboltstrand, CA 94032";
const BLUE_EMAIL = "bca34@gmail.com";
const IRON_EMAIL = "ivs873@gmail.com";

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
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Date: _____________________________",
  ].join("\n");
}

/** Selected reviewer corpus: names/titles/emails only — address lines omitted (TEST319). */
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
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Date: _____________________________",
  ].join("\n");
}

/** Reviewer corpus with blank address lines. */
function buildReviewerRouteBlankAddressBody() {
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
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Date: _____________________________",
  ].join("\n");
}

function buildReviewerRouteBlankMetadataBody() {
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
    "Name: _____________________________",
    "Title: ____________________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: _____________________________",
    "Title: ____________________________",
    "Date: _____________________________",
  ].join("\n");
}

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: BLUE_EMAIL,
    recipient2Email: IRON_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [BLUE_ADDRESS, IRON_ADDRESS],
  });
}

function baseDraft(): AgreementDraft {
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

/** Reviewer route: selected corpus partial; finalized /app/create corpus on draft field. */
function reviewerDraftWithFinalizedOnServer(partialSelected: string) {
  return {
    ...baseDraft(),
    server_full_document_text: partialSelected,
    premium_server_full_document_text: buildFullyHydratedBody(),
  };
}

function armHandoffWithoutAddresses() {
  writePremiumRecipientHandoffLinear([
    {
      name: BLUE,
      email: BLUE_EMAIL,
      role: "owner",
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
    },
    {
      name: IRON,
      email: IRON_EMAIL,
      role: "party",
      signerName: "Michael Torres",
      signerTitle: "President",
    },
  ]);
}

function expectFullyHydratedExecutionBlock(text: string) {
  expect(text).toMatch(/Sarah Mitchell/i);
  expect(text).toMatch(/\bCEO\b/);
  expect(text).toMatch(/Michael Torres/i);
  expect(text).toMatch(/President/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text;
  expect(tail).not.toMatch(/Email for Notice:/i);
  expect(tail).not.toMatch(/Address for Notice:/i);
  expect(countBlankExecutionMetadataLines(text)).toBe(0);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
}

describe("Test319 reviewer execution metadata source", () => {
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

  it("collects finalized corpus hints from draft server fields for reviewer routes", () => {
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRoutePartialBody());
    const hints = collectFinalizedCorpusHintsFromDraft(draft);
    expect(hints.some((h) => h.includes("Sarah Mitchell"))).toBe(true);
    expect(hints.some((h) => h.includes("Michael Torres"))).toBe(true);
  });

  it("detects address carryover is not required when contact authority keeps notice data out of execution blocks", () => {
    const partial = buildReviewerRoutePartialBody();
    const meta = resolveReviewReadyRecipientMetadata(reviewerDraftWithFinalizedOnServer(partial), {
      corpusHints: [buildFullyHydratedBody()],
    });
    expect(executionBlockMissingAddressCarryover(partial, meta)).toBe(false);
    expect(meta?.partySignerNames?.[0]).toBe("Sarah Mitchell");
    expect(meta?.partyAddresses?.[0] ?? "").toBe("");
  });

  it("merges party addresses from snapshot metadata when handoff omits partyAddress", () => {
    armHandoffWithoutAddresses();
    const authority = qaAuthority();
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
    createAuthoritativeSigningSnapshot({
      corpus: buildFullyHydratedBody(),
      signerMetadata: {
        partySignerNames: ["Sarah Mitchell", "Michael Torres"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: [BLUE_ADDRESS, IRON_ADDRESS],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: BLUE_EMAIL,
        recipient2Email: IRON_EMAIL,
        extraPartyReviewEmails: [],
      },
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    });
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRoutePartialBody());
    const meta = resolveReviewReadyRecipientMetadata(draft, {
      corpusHints: collectFinalizedCorpusHintsFromDraft(draft),
    });
    expect(meta?.partyAddresses?.[0]).toContain("Firestane");
    expect(meta?.partyAddresses?.[1]).toContain("Tree Trunk");
  });

  it("Party 1 reviewer restores signing capacity from draft finalized corpus without local pinned session", () => {
    armHandoffWithoutAddresses();
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRoutePartialBody());
    const display = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expect(display?.source).toBe("server_full_document_text");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 2 reviewer matches Party 1 hydrated execution block including addresses", () => {
    armHandoffWithoutAddresses();
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRouteBlankAddressBody());
    const party1 = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    const party2 = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expect(party2?.text).toBe(party1?.text);
    expectFullyHydratedExecutionBlock(party2?.text ?? "");
  });

  it("Review Link Ready restores signing capacity when handoff lacks partyAddress", () => {
    armHandoffWithoutAddresses();
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRoutePartialBody());
    const display = resolveReviewFirstDisplayCorpus(draft, "owner_done");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("copy/export retains hydrated signing capacity after reviewer backfill", () => {
    armHandoffWithoutAddresses();
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRoutePartialBody());
    const reviewer = resolveReviewFirstDisplayCorpus(draft, "reviewer")?.text ?? "";
    const copyText = formatAgreementPlainTextForEditing(
      resolveReviewFirstDisplayCorpus(draft, "copy_export")?.text ?? "",
    );
    expectFullyHydratedExecutionBlock(reviewer);
    expectFullyHydratedExecutionBlock(copyText);
  });

  it("full blank metadata on reviewer route restores from draft finalized corpus", () => {
    armHandoffWithoutAddresses();
    const draft = {
      ...reviewerDraftWithFinalizedOnServer(buildReviewerRouteBlankMetadataBody()),
      server_full_document_text: buildReviewerRouteBlankMetadataBody(),
    };
    const display = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("still restores signing capacity when local pinned corpus exists alongside partial selected corpus", () => {
    const authority = qaAuthority();
    const fullHydrated = buildFullyHydratedBody();
    const partial = buildReviewerRoutePartialBody();
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);

    createAuthoritativeSigningSnapshot({
      corpus: fullHydrated,
      signerMetadata: {
        partySignerNames: ["Sarah Mitchell", "Michael Torres"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: ["", ""],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: BLUE_EMAIL,
        recipient2Email: IRON_EMAIL,
        extraPartyReviewEmails: [],
      },
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    });
    replaceAuthoritativeSigningSnapshotCorpus({
      corpus: partial,
      surface: "test319_partial_reviewer_corpus",
    });
    setPaidProPinnedSignerAppliedCorpus(fullHydrated);
    armHandoffWithoutAddresses();

    const draft = reviewerDraftWithFinalizedOnServer(partial);
    const display = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("preserves exactly one execution block on reviewer route", () => {
    armHandoffWithoutAddresses();
    const draft = reviewerDraftWithFinalizedOnServer(buildReviewerRoutePartialBody());
    const text = resolveReviewFirstDisplayCorpus(draft, "reviewer")?.text ?? "";
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect((text.match(/IN WITNESS WHEREOF/gi) ?? []).length).toBe(1);
  });
});
