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
  applyReviewReadyMetadataBackfill,
  corpusHasFullyHydratedExecutionBlock,
  countBlankExecutionMetadataLines,
  findStrongestHydratedReviewCorpus,
  resetPaidProTest315ReviewCopyHydrationLogsForTests,
  resolveReviewReadyRecipientMetadata,
  spliceHydratedExecutionTail,
} from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";
import { clearReviewFirstHandoffSource } from "../../launch/simpleProduct/reviewFirstSendSurface";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test318_reviewer_metadata";
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
    `Email for Notice: ${BLUE_EMAIL}`,
    `Address for Notice: ${BLUE_ADDRESS}`,
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    `Email for Notice: ${IRON_EMAIL}`,
    `Address for Notice: ${IRON_ADDRESS}`,
    "Date: _____________________________",
  ].join("\n");
}

/** Reviewer-route corpus: all signer metadata lines blank (TEST318 regression). */
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
    "Email for Notice: __________________",
    "Address for Notice: ________________",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: _____________________________",
    "Title: ____________________________",
    "Email for Notice: __________________",
    "Address for Notice: ________________",
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

/** Stale handoff: legal entity names only — blank signer metadata (TEST318). */
function armHandoffWithBlankSignerFields() {
  writePremiumRecipientHandoffLinear([
    { name: BLUE, email: "", role: "owner", signerName: "", signerTitle: "" },
    { name: IRON, email: "", role: "party", signerName: "", signerTitle: "" },
  ]);
}

function armBlankMetadataRegressionFixture() {
  const authority = qaAuthority();
  const fullHydrated = buildFullyHydratedBody();
  const blank = buildReviewerRouteBlankMetadataBody();
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);

  createAuthoritativeSigningSnapshot({
    corpus: fullHydrated,
    signerMetadata: {
      partySignerNames: ["", ""],
      partySignerTitles: ["", ""],
      partyAddresses: ["", ""],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    },
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({
    corpus: blank,
    surface: "test318_reviewer_blank_metadata_corpus",
  });
  setPaidProPinnedSignerAppliedCorpus(fullHydrated);
  clearConsumedPaidProSignerMetadataAuthority();
}

function expectFullyHydratedExecutionBlock(text: string) {
  expect(text).toMatch(/Sarah Mitchell/i);
  expect(text).toMatch(/\bCEO\b/);
  expect(text).toMatch(/Michael Torres/i);
  expect(text).toMatch(/President/i);
  expect(text).toMatch(new RegExp(BLUE_EMAIL.replace(".", "\\.")));
  expect(text).toMatch(new RegExp(IRON_EMAIL.replace(".", "\\.")));
  expect(text).toContain(BLUE_ADDRESS);
  expect(text).toContain(IRON_ADDRESS);
  expect(countBlankExecutionMetadataLines(text)).toBe(0);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
}

describe("Test318 reviewer metadata carryover", () => {
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

  it("detects fully hydrated execution block in pinned finalized corpus", () => {
    const full = buildFullyHydratedBody();
    expect(corpusHasFullyHydratedExecutionBlock(full)).toBe(true);
    expect(corpusHasFullyHydratedExecutionBlock(buildReviewerRouteBlankMetadataBody())).toBe(false);
  });

  it("finds strongest hydrated corpus and splices execution tail over blank reviewer corpus", () => {
    const full = buildFullyHydratedBody();
    const blank = buildReviewerRouteBlankMetadataBody();
    setPaidProPinnedSignerAppliedCorpus(full);

    const strongest = findStrongestHydratedReviewCorpus([blank]);
    expect(strongest?.source).toBe("pinned_finalized_corpus");

    const spliced = spliceHydratedExecutionTail(blank, full);
    expectFullyHydratedExecutionBlock(spliced);
  });

  it("resolves full metadata from pinned corpus when handoff and snapshot metadata are blank", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const draft = blueIronDraft();
    const meta = resolveReviewReadyRecipientMetadata(draft, {
      corpusHints: [buildFullyHydratedBody()],
    });
    expect(meta?.partySignerNames?.[0]).toBe("Sarah Mitchell");
    expect(meta?.partySignerNames?.[1]).toBe("Michael Torres");
    expect(meta?.partySignerTitles?.[0]).toBe("CEO");
    expect(meta?.partySignerTitles?.[1]).toBe("President");
    expect(meta?.recipient1Email).toBe(BLUE_EMAIL);
    expect(meta?.recipient2Email).toBe(IRON_EMAIL);
    expect(meta?.partyAddresses?.[0]).toContain("Firestane");
    expect(meta?.partyAddresses?.[1]).toContain("Tree Trunk");
  });

  it("applyReviewReadyMetadataBackfill replaces blank execution block from finalized source", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const draft = blueIronDraft();
    const blank = buildReviewerRouteBlankMetadataBody();
    const after = applyReviewReadyMetadataBackfill(blank, draft, {
      surface: "reviewer",
      selectedSource: "authoritative_signing_snapshot",
      corpusHints: [buildFullyHydratedBody()],
    });
    expectFullyHydratedExecutionBlock(after);
  });

  it("Review Link Ready shows full signer metadata for both parties", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    expect(display?.source).toBe("authoritative_signing_snapshot");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 1 reviewer page shows full signer metadata", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expectFullyHydratedExecutionBlock(display?.text ?? "");
  });

  it("Party 2 reviewer page matches owner hydrated execution block", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const ownerDisplay = resolveReviewFirstDisplayCorpus(blueIronDraft(), "owner_done");
    const party2Display = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer");
    expect(party2Display?.text).toBe(ownerDisplay?.text);
    expectFullyHydratedExecutionBlock(party2Display?.text ?? "");
  });

  it("copy agreement text includes full hydrated execution block", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const corpus = resolveReviewFirstDisplayCorpus(blueIronDraft(), "copy_export")?.text ?? "";
    const copyText = formatAgreementPlainTextForEditing(corpus);
    expectFullyHydratedExecutionBlock(copyText);
  });

  it("blank handoff metadata cannot overwrite nonblank finalized metadata", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const meta = resolveReviewReadyRecipientMetadata(blueIronDraft(), {
      corpusHints: [buildFullyHydratedBody(), buildReviewerRouteBlankMetadataBody()],
    });
    expect(meta?.partySignerNames?.[0]).toBe("Sarah Mitchell");
    expect(meta?.partySignerNames?.[1]).toBe("Michael Torres");
    expect(meta?.recipient1Email).toBe(BLUE_EMAIL);
  });

  it("preserves exactly one execution block", () => {
    armBlankMetadataRegressionFixture();
    armHandoffWithBlankSignerFields();
    const text = resolveReviewFirstDisplayCorpus(blueIronDraft(), "reviewer")?.text ?? "";
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect((text.match(/IN WITNESS WHEREOF/gi) ?? []).length).toBe(1);
  });
});
