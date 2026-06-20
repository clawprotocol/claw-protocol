/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import { resolveReviewFirstDisplayCorpus } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  replaceAuthoritativeSigningSnapshotCorpus,
} from "../components/agreements/authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "../components/agreements/guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "../components/agreements/paidProSignerMetadataAuthority";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "../components/agreements/paidProFinalHydratedCorpus";
import {
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffLinear,
} from "../components/agreements/premiumPartyNamesHandoff";
import { countPaidProExecutionBlocks } from "../components/agreements/paidProExecutionBlockAuthority";
import {
  resetPaidProTest315ReviewCopyHydrationLogsForTests,
  resolveReviewReadyRecipientMetadata,
} from "../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";

const agreementId = "ag_test320_reviewer_visible_metadata";
const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
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

function buildReviewerRoutePartialBody() {
  return buildFullyHydratedBody();
}

function reviewerDraftFromApi(): AgreementDraft {
  const partial = buildReviewerRoutePartialBody();
  return {
    id: agreementId,
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: BLUE, role: "owner" },
      { id: "p2", name: IRON, role: "party" },
    ],
    purpose: partial,
    payment_terms: "premium",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    premium_render_source: "review_first_final_corpus",
    server_full_document_text: partial,
    premium_server_full_document_text: buildFullyHydratedBody(),
    pro_redline_v1: {
      review_first_final_corpus: { text: partial },
    },
  };
}

function armPartialSnapshotWithFullDraftHint() {
  const authority = buildLivePaidProSignerMetadataAuthority({
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
  const fullHydrated = buildFullyHydratedBody();
  const partial = buildReviewerRoutePartialBody();
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);

  createAuthoritativeSigningSnapshot({
    corpus: fullHydrated,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({
    corpus: partial,
    surface: "test320_reviewer_partial_snapshot",
  });
  setPaidProPinnedSignerAppliedCorpus(fullHydrated);
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

describe("Test320 AgreementRecipientReview visible execution metadata", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    resetPremiumRecipientHandoffDedupForTests();
    resetPaidProTest315ReviewCopyHydrationLogsForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("reviewer display HTML includes signing-capacity fields without execution-block notice lines", () => {
    armPartialSnapshotWithFullDraftHint();
    armHandoffWithoutAddresses();
    const draft = reviewerDraftFromApi();

    const corpusResult = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expect(corpusResult?.text).toMatch(/Sarah Mitchell/i);
    expect(corpusResult?.text).toMatch(/Michael Torres/i);

    const meta = resolveReviewReadyRecipientMetadata(draft);
    expect(meta?.partyAddresses?.[0]).toContain("Firestane");
    expect(meta?.partyAddresses?.[1]).toContain("Tree Trunk");

    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpusResult?.text,
      partyNames: [BLUE, IRON],
      draft,
      surface: "reviewer",
      selectedCorpusSource: corpusResult?.source,
      agreementId,
    });

    expect(html).toMatch(/Sarah Mitchell/i);
    expect(html).toMatch(/Michael Torres/i);
    expect(html).not.toMatch(/Email for Notice:/i);
    expect(html).not.toMatch(/Address for Notice:/i);

    const copyText = formatAgreementPlainTextForEditing(
      resolveReviewFirstDisplayCorpus(draft, "copy_export")?.text ?? "",
    );
    expect(copyText).toMatch(/Sarah Mitchell/i);
    expect(copyText).toMatch(/Michael Torres/i);
    expect(countPaidProExecutionBlocks(copyText)).toBe(1);
  });
});
