/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildReviewFirstDocumentDisplayHtml } from "../../agreement/reviewFirstDocumentDisplay";
import {
  classifyPaidProDocumentBlocks,
  isMainSectionHeadingLine,
} from "./paidProDocumentBlockClassifier";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  applyReviewTrackDisplayFormatting,
  resolveReviewFirstDisplayCorpus,
} from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
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
import { clearReviewFirstHandoffSource } from "../../launch/simpleProduct/reviewFirstSendSurface";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProReviewLinkCorpusPlain } from "./paidProReviewLinkCorpusParity";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";
const AGREEMENT_ID = "ag_test344_reviewer_formatting";

/** Flattened post-finalize snapshot with inline Section 1 (a)/(b)/(c) and glued subsections (test344). */
export function buildTest344FlattenedReviewerSnapshotCorpus(): string {
  const operative = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    `This Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and between ${RED_MESA} ("Client") and ${HARBOR_PEAK} ("Service Provider").`,
    'Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties."',
    `1. Parties and Roles The parties to this Agreement are: (a) ${RED_MESA}, Client; (b) ${HARBOR_PEAK}, Service Provider; and (c) each a "Party" as defined herein.`,
    "2. Services and Deliverables Service Provider will provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services for Client.",
    "3. Term The term is twelve (12) months from the Effective Date.",
    "10. Termination and Effect of Termination Termination for Convenience. Either party may terminate this Agreement for convenience on thirty (30) days' prior written notice.",
    "10.3 Effect of Termination Either party's termination will not affect accrued rights or obligations.",
    "11. General Provisions 11.7 Survival. Certain provisions survive termination.",
    "12.1 Assignment Neither party may assign this Agreement without the other party's prior written consent.",
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
    server_full_document_text: "1. Parties and Roles The parties to this Agreement are:",
    premium_server_full_document_text: buildTest344FlattenedReviewerSnapshotCorpus(),
    pro_redline_v1: {
      review_first_final_corpus: { text: "STALE_REVIEW_CORPUS" },
    },
  };
}

function assertSectionOneEnumerationsFormatted(text: string): void {
  expect(text).toMatch(/\n\n\(a\)\s+/i);
  expect(text).toMatch(/\n\(b\)\s+/i);
  expect(text).toMatch(/\n\(c\)\s+/i);
  expect(text).not.toMatch(/\(a\)[^\n]{0,240}\(b\)/i);
}

function assertMainHeadingsIsolated(text: string): void {
  const blocks = classifyPaidProDocumentBlocks(text);
  const mainHeadings = blocks
    .filter((b) => b.kind === "main_section_heading")
    .map((b) => b.firstLine);
  expect(mainHeadings.some((h) => /^1\.\s+Parties and Roles$/i.test(h))).toBe(true);
  expect(mainHeadings.some((h) => /^2\.\s+Services and Deliverables$/i.test(h))).toBe(true);
  expect(mainHeadings.some((h) => /^10\.\s+Termination and Effect of Termination$/i.test(h))).toBe(true);
  for (const heading of mainHeadings) {
    expect(isMainSectionHeadingLine(heading)).toBe(true);
  }
}

function assertSubsectionsReadable(text: string): void {
  expect(text).toMatch(/10\.3 Effect of Termination\n/i);
  expect(text).toMatch(/12\.1 Assignment\n/i);
}

function assertReviewerDisplayFormatting(text: string): void {
  expect(text).toContain(RED_MESA);
  expect(text).toContain(HARBOR_PEAK);
  assertSectionOneEnumerationsFormatted(text);
  assertMainHeadingsIsolated(text);
  assertSubsectionsReadable(text);
  expect(text).toMatch(/Sidney Thomas/i);
  expect(text).toMatch(/Hunt Punter/i);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect((text.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
  expect(countBlankSignerMetadataLinesInExecutionBlock(text)).toBe(0);
}

describe("paidProTest344ReviewerDisplayFormattingRegression", () => {
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

  it("applyReviewTrackDisplayFormatting splits Section 1 (a)/(b)/(c) and glued headings", () => {
    const formatted = applyReviewTrackDisplayFormatting(buildTest344FlattenedReviewerSnapshotCorpus());
    assertReviewerDisplayFormatting(formatted);
  });

  it("reviewer handoff resolves display-formatted corpus while frozen transport hash stays unchanged", () => {
    const flattened = buildTest344FlattenedReviewerSnapshotCorpus();
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

  it("reviewer HTML bolds main headings and renders enumerated clauses on separate blocks", () => {
    const flattened = buildTest344FlattenedReviewerSnapshotCorpus();
    armFlattenedFinalizeSnapshot(flattened);
    const draft = reviewerDraft();
    const reviewer = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    const ownerReview = getPaidProDocumentForSurface("review")?.text ?? "";

    assertReviewerDisplayFormatting(reviewer?.text ?? "");
    expect(ownerReview).toBe(reviewer?.text);

    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>fallback</p>",
      corpusText: reviewer?.text ?? "",
      draft,
      surface: "reviewer",
      selectedCorpusSource: reviewer?.source,
      agreementId: AGREEMENT_ID,
    });

    expect(html).toContain('class="premium-doc-section-heading"');
    expect(html).toMatch(/<h2 class="premium-doc-section-heading">1\. Parties and Roles<\/h2>/i);
    expect(html).toMatch(/<h2 class="premium-doc-section-heading">2\. Services and Deliverables<\/h2>/i);
    expect(html).toMatch(/10\.3 Effect of Termination/);
    expect(html).toMatch(/12\.1 Assignment/);
    expect(html.match(/<p>\(a\)/gi)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(html.match(/<p>\(b\)/gi)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(html.match(/<p>\(c\)/gi)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect((html.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length).toBe(1);
  });

  it("owner review, SoT parity, and frozen transport bytes remain aligned after finalize", () => {
    const flattened = buildTest344FlattenedReviewerSnapshotCorpus();
    armFlattenedFinalizeSnapshot(flattened);
    const draft = reviewerDraft();
    const frozenHash = hashPaidProCorpus(readAuthoritativeSigningCorpus());
    const handoffPlain = resolvePaidProPostFinalizeReviewPlain();
    const linkCorpus = resolvePaidProReviewLinkCorpusPlain();

    const reviewer = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    const ownerReview = getPaidProDocumentForSurface("review")?.text ?? "";
    const renderPlain = resolvePaidProReviewRenderPlain();

    assertReviewerDisplayFormatting(reviewer?.text ?? "");
    expect(ownerReview).toBe(reviewer?.text);
    expect(renderPlain).toBe(reviewer?.text);

    expect(hashPaidProCorpus(handoffPlain)).toBe(frozenHash);
    expect(linkCorpus?.plain).toBe(handoffPlain);
    expect(hashPaidProCorpus(linkCorpus?.plain ?? "")).toBe(frozenHash);

    const parity = auditPaidProReviewRenderSotParity({
      reviewPlain: renderPlain,
      surface: "test344_parity",
    });
    expect(parity.blankSignerLinesRemaining).toBe(0);
    expect(parity.invariantOk).toBe(true);
  });
});
