/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
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
  stripUnsuppliedPartyAddressPlaceholders,
} from "../components/agreements/polishProAgreementDisplayLayer";
import { resetPaidProTest315ReviewCopyHydrationLogsForTests } from "../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const BLUE_ADDRESS = "13 Firestane Ave., Billings, MT 65323";
const IRON_ADDRESS = "934 Tree Trunk Blvd., Humboltstrand, CA 94032";

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
    "Email for Notice: bca34@gmail.com",
    `Address for Notice: ${BLUE_ADDRESS}`,
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: ivs873@gmail.com",
    `Address for Notice: ${IRON_ADDRESS}`,
    "Date: _____________________________",
  ].join("\n");
}

function buildPartialBody() {
  return buildFullyHydratedBody()
    .split("\n")
    .filter((line) => !/^Address for Notice:/i.test(line.trim()))
    .join("\n");
}

function reviewerDraft(partial: string): AgreementDraft {
  return {
    id: "ag_test320_html",
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
    pro_redline_v1: { review_first_final_corpus: { text: partial } },
  };
}

function armSnapshot() {
  const authority = buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "bca34@gmail.com",
    recipient2Email: "ivs873@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [BLUE_ADDRESS, IRON_ADDRESS],
  });
  const full = buildFullyHydratedBody();
  const partial = buildPartialBody();
  createAuthoritativeSigningSnapshot({
    corpus: full,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({
      identities: authorityPartiesToCanonicalPartyIdentities(authority.parties),
      signFirst: true,
    }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({ corpus: partial, surface: "test320" });
  setPaidProPinnedSignerAppliedCorpus(full);
  return reviewerDraft(partial);
}

describe("Test320 reviewFirstDocumentDisplayHtml", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    resetPaidProTest315ReviewCopyHydrationLogsForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("stripUnsuppliedPartyAddressPlaceholders keeps hydrated Address for Notice lines", () => {
    const line = `Address for Notice: ${BLUE_ADDRESS}`;
    const kept = stripUnsuppliedPartyAddressPlaceholders(line, null).text;
    expect(kept).toContain(BLUE_ADDRESS);
  });

  it("visible HTML includes both Address for Notice values from partial snapshot", () => {
    const draft = armSnapshot();
    const corpusResult = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expect(corpusResult?.text).toContain(BLUE_ADDRESS);

    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpusResult?.text,
      partyNames: [BLUE, IRON],
      draft,
      surface: "reviewer",
      selectedCorpusSource: corpusResult?.source,
    });

    expect(html).toContain(BLUE_ADDRESS);
    expect(html).toContain(IRON_ADDRESS);
    expect(html).toMatch(/Address for Notice/i);
  });
});
