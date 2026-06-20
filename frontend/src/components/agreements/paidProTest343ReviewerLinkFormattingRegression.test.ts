/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildReviewFirstDocumentDisplayHtml } from "../../agreement/reviewFirstDocumentDisplay";
import { formatAgreementPlainTextForEditing } from "../../agreement/formatAgreementPlainTextForEditing";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  applyReviewTrackDisplayFormatting,
  resolveReviewFirstDisplayCorpus,
} from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import { clearReviewFirstHandoffSource } from "../../launch/simpleProduct/reviewFirstSendSurface";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProReviewLinkCorpusPlain } from "./paidProReviewLinkCorpusParity";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";
const AGREEMENT_ID = "ag_test343_reviewer_formatting";

/** Flattened post-finalize snapshot body (test343 production shape). */
export function buildTest343FlattenedReviewerSnapshotCorpus(): string {
  const operative = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    `This Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    'Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties."',
    "1. Services and Deliverables Service Provider will provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services for Client.",
    "2. Deliverables, Reviews and Changes 2.1 Deliverables. Client will review deliverables in good faith. 2.2 Review and Feedback. Client will provide timely feedback on submitted deliverables.",
    "3. Term The term is twelve (12) months from the Effective Date.",
    "11. General Provisions 11.7 Survival. Certain provisions survive termination. 11.8 Counterparts. This Agreement may be executed electronically.",
  ].join(" ");

  const witness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    RED_MESA,
    "By: __________________________",
    "Name: Sidney Thomas",
    "Title: Manager",
    "Date: _____________________________",
    "SERVICE PROVIDER:",
    HARBOR_PEAK,
    "By: __________________________",
    "Name: Hunt Punter",
    "Title: CEO",
    "Date: _____________________________",
  ].join("\n");

  return `${operative}\n\n${witness}`;
}

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED_MESA,
    recipient2Name: HARBOR_PEAK,
    recipient1Email: "anthemhayek@me.com",
    recipient2Email: "cryptocurated21@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sidney Thomas", "Hunt Punter"],
    partySignerTitles: ["Manager", "CEO"],
    partyAddresses: ["135 Hunt Ave., Donesville, KS 78653", "127 Minte St., Minony, IN 85432"],
  });
}

function armFlattenedFinalizeSnapshot(flattenedCorpus: string) {
  const authority = qaAuthority();
  establishPaidProSourceOfTruth({
    text: flattenedCorpus,
    source: "server_full_draft",
    intakeText: "consulting between Red Mesa and Harbor Peak",
  });
  setConsumedPaidProSignerMetadataAuthority(authority);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: flattenedCorpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  setPaidProPinnedSignerAppliedCorpus(flattenedCorpus);
}

function reviewerDraft(): AgreementDraft {
  return {
    id: AGREEMENT_ID,
    title: "Consulting Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { id: "p1", name: RED_MESA, role: "Client" },
      { id: "p2", name: HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: "short starter fallback",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    premium_render_source: "review_first_final_corpus",
    server_full_document_text: flattenedGlueMarker(),
    premium_server_full_document_text: buildTest343FlattenedReviewerSnapshotCorpus(),
    pro_redline_v1: {
      review_first_final_corpus: { text: "STALE_REVIEW_CORPUS" },
    },
  };
}

function flattenedGlueMarker(): string {
  return "1. Services and Deliverables Service Provider will provide";
}

function assertReviewerDisplayFormatting(text: string): void {
  expect(text).toContain(RED_MESA);
  expect(text).toContain(HARBOR_PEAK);
  expect(text).toMatch(/\n\n1\.\s+Services and Deliverables\n/);
  expect(text).toMatch(/\n\n2\.\s+Deliverables, Reviews and Changes\n/);
  expect(text).not.toMatch(/CONSULTING AND IMPLEMENTATION AGREEMENT This Consulting/i);
  expect(text).not.toMatch(/Services and Deliverables Service Provider will provide/);
  expect(text).toMatch(/Sidney Thomas/i);
  expect(text).toMatch(/Hunt Punter/i);
  expect(text).toMatch(/anthemhayek@me\.com/i);
  expect(text).toMatch(/cryptocurated21@gmail\.com/i);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect((text.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
}

describe("paidProTest343ReviewerLinkFormattingRegression", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearReviewFirstHandoffSource();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("applyReviewTrackDisplayFormatting splits flattened operative text without touching witness tail", () => {
    const raw = buildTest343FlattenedReviewerSnapshotCorpus();
    const formatted = applyReviewTrackDisplayFormatting(raw);
    assertReviewerDisplayFormatting(formatted);
    expect(formatted).toMatch(/\n\nIN WITNESS WHEREOF/i);
  });

  it("reviewer handoff resolves display-formatted corpus while frozen snapshot stays flattened", () => {
    const flattened = buildTest343FlattenedReviewerSnapshotCorpus();
    armFlattenedFinalizeSnapshot(flattened);
    const frozenSnapshot = readAuthoritativeSigningCorpus();
    const frozenHash = hashPaidProCorpus(frozenSnapshot);

    const reviewer = resolveReviewFirstDisplayCorpus(reviewerDraft(), "reviewer");
    expect(reviewer?.source).toBe("authoritative_signing_snapshot");
    assertReviewerDisplayFormatting(reviewer?.text ?? "");
    expect(reviewer?.hash).not.toBe(frozenHash);
    expect(readAuthoritativeSigningCorpus()).toBe(frozenSnapshot);
    expect(hashPaidProCorpus(readAuthoritativeSigningCorpus())).toBe(frozenHash);
  });

  it("reviewer HTML and copy_export surfaces use the same formatted display corpus", () => {
    const flattened = buildTest343FlattenedReviewerSnapshotCorpus();
    armFlattenedFinalizeSnapshot(flattened);
    const draft = reviewerDraft();

    const reviewer = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    const copyExport = resolveReviewFirstDisplayCorpus(draft, "copy_export");
    assertReviewerDisplayFormatting(reviewer?.text ?? "");
    expect(copyExport?.text).toBe(reviewer?.text);

    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>fallback</p>",
      corpusText: reviewer?.text ?? "",
      draft,
      surface: "reviewer",
      selectedCorpusSource: reviewer?.source,
      agreementId: AGREEMENT_ID,
    });
    expect(html).toContain("Services and Deliverables");
    expect(html).not.toContain(flattenedGlueMarker());

    const copyPlain = formatAgreementPlainTextForEditing(copyExport?.text ?? "");
    expect(copyPlain).toMatch(/\n\n1\.\s+Services and Deliverables/);
    expect(copyPlain).toContain("Sidney Thomas");
  });

  it("owner post-finalize review and copy surfaces match reviewer display; transport bytes stay frozen", () => {
    const flattened = buildTest343FlattenedReviewerSnapshotCorpus();
    armFlattenedFinalizeSnapshot(flattened);
    const draft = reviewerDraft();
    const frozenSnapshot = readAuthoritativeSigningCorpus();
    const frozenHash = hashPaidProCorpus(frozenSnapshot);
    const handoffPlain = resolvePaidProPostFinalizeReviewPlain();
    const linkCorpus = resolvePaidProReviewLinkCorpusPlain();

    const reviewer = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    const copyExport = resolveReviewFirstDisplayCorpus(draft, "copy_export");
    const ownerReview = getPaidProDocumentForSurface("review")?.text ?? "";
    const ownerCopy = getPaidProDocumentForSurface("copy")?.text ?? "";
    const vs01 = getPaidProDocumentForSurface("vs01")?.text ?? "";

    assertReviewerDisplayFormatting(reviewer?.text ?? "");
    expect(ownerReview).toBe(reviewer?.text);
    expect(ownerCopy).toBe(copyExport?.text);
    expect(ownerCopy).toBe(reviewer?.text);

    expect(hashPaidProCorpus(handoffPlain)).toBe(frozenHash);
    expect(linkCorpus?.plain).toBe(handoffPlain);
    expect(hashPaidProCorpus(linkCorpus?.plain ?? "")).toBe(frozenHash);
    expect(readAuthoritativeSigningCorpus()).toBe(frozenSnapshot);
    expect(hashPaidProCorpus(vs01)).toBe(frozenHash);
    expect(vs01).not.toMatch(/\n\n1\.\s+Services and Deliverables\n/);
    expect(vs01).toContain(HARBOR_PEAK);
    expect((vs01.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
  });
});
