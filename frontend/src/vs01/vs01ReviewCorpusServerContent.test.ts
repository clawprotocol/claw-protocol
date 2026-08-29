/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIRST_FAILING_STALE_TEMPLATE_SEED_PREDICATE,
  resolveSeededDocumentReuseFromReviewCorpus,
} from "./vs01ReviewCorpusSeedRefresh";
import {
  FIRST_FAILING_SERVER_CONTENT_PREDICATE,
  REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON,
  REUSE_MATCHING_SERVER_CONTENT_REASON,
  bindReviewCorpusOntoSeededVs01Document,
  clearReviewServerContentBinding,
  extractPlainTextFromDocumentContent,
  fetchedPlainPositivelyMatchesReviewCorpus,
  loadReviewServerContentBinding,
  resolveServerContentReplaceDecision,
  storeReviewServerContentBinding,
} from "./vs01ReviewCorpusServerContent";
import {
  RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
  isPaidProPacketReadyDashboardPath,
  resolvePostPrepareBuyerSurface,
} from "./vs01PrivateSigningLinksLanding";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SEEDED_DOC = "doc_e959491fdcef431c96052cbb74e0fdaf";
const REPLACED_DOC = "doc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fetchContentOf(plain: string): (id: string) => Promise<string> {
  return async () => plain;
}

function padCorpus(body: string): string {
  return `${body}\n\n${"The parties agree to perform the stated obligations in good faith. ".repeat(40)}`.trim();
}

function reviewServicesAgreement(): string {
  return padCorpus(
    [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Northline Studio (Client) and Harbor Marks LLC (Service Provider).",
      "",
      "10. LIABILITY",
      "Each party's aggregate liability is limited to fees paid under this Agreement.",
      "",
      "11. GOVERNING LAW",
      "This Agreement is governed by the laws of the State of Texas.",
      "",
      "12. NOTICES",
      "If to Northline Studio:",
      "Attn: Priya Shah",
      "Email: priya@example.test",
      "",
      "If to Harbor Marks LLC:",
      "Attn: Diego Alvarez",
      "Email: diego@example.test",
      "",
      "13. MISCELLANEOUS",
      "This Agreement constitutes the entire agreement of the parties.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Northline Studio",
      "By: ______________________",
      "Name: Priya Shah",
      "Title: Founder",
      "Date: ____________________",
      "",
      "SERVICE PROVIDER:",
      "Harbor Marks LLC",
      "By: ______________________",
      "Name: Diego Alvarez",
      "Title: Principal",
      "Date: ____________________",
    ].join("\n"),
  );
}

function nonBindingTemplatePacket(): string {
  return padCorpus(
    [
      "Draft Agreement (non-binding template)",
      "",
      "This Draft Agreement is between Northline Studio (Client) and Harbor Marks LLC (Service Provider).",
      "",
      "1. SCOPE",
      "Provider will deliver the services described in the intake.",
      "",
      "2. COMPENSATION",
      "Fees are due as stated in the attached schedule.",
      "",
      "3. TERM",
      "This agreement continues until completed or terminated.",
      "",
      "4. CONFIDENTIALITY",
      "Each party will protect confidential information.",
      "",
      "5. IP",
      "Work product ownership follows the parties' written allocation.",
      "",
      "6. TERMINATION",
      "Either party may terminate for material breach.",
      "",
      "7. GENERAL",
      "This is a starter packet only.",
      "",
      "8. SIGNATURES",
      "Northline Studio",
      "Harbor Marks LLC",
    ].join("\n"),
  );
}

describe("Prepare writes Review corpus onto GET /content", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("names the first failing predicate: esign paints GET content, not client seed", () => {
    expect(FIRST_FAILING_SERVER_CONTENT_PREDICATE).toBe("esign_paints_get_content_not_client_seed");
    expect(FIRST_FAILING_STALE_TEMPLATE_SEED_PREDICATE).toBe(
      "reuse_seeded_vs01_document_keeps_stale_template_body",
    );
  });

  it("after Prepare, stored/fetched packet content is Review corpus not template", async () => {
    const review = reviewServicesAgreement();
    const template = nonBindingTemplatePacket();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "b".repeat(64),
    });

    const bound = await bindReviewCorpusOntoSeededVs01Document({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      existingBridgeCorpus: template,
      seed,
      fetchContent: fetchContentOf(template),
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reason).toBe(REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON);
    expect(bound.fetchedWasTemplate).toBe(true);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed).toHaveBeenCalledWith(
      AGREEMENT_ID,
      null,
      review,
      expect.any(String),
      SEEDED_DOC,
    );
    expect(seed.mock.calls[0][2]).toMatch(/SERVICES AGREEMENT/);
    expect(seed.mock.calls[0][2]).toMatch(/10\.\s+LIABILITY/i);
    expect(seed.mock.calls[0][2]).not.toMatch(/Draft Agreement \(non-binding template\)/i);
  });

  it("a stale server template for an existing vs01 id is replaced", async () => {
    const review = reviewServicesAgreement();
    const template = nonBindingTemplatePacket();
    expect(
      resolveServerContentReplaceDecision({
        fetchedPlain: template,
        reviewCorpus: review,
      }).replace,
    ).toBe(true);
    expect(
      resolveServerContentReplaceDecision({
        fetchedPlain: template,
        reviewCorpus: review,
      }).reason,
    ).toBe(REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON);

    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: REPLACED_DOC,
      contentSha256: "c".repeat(64),
    });
    const bound = await bindReviewCorpusOntoSeededVs01Document({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      seed,
      fetchContent: fetchContentOf(template),
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(REPLACED_DOC);
    expect(seed).toHaveBeenCalledWith(
      AGREEMENT_ID,
      null,
      review,
      expect.any(String),
      SEEDED_DOC,
    );
    const recorded = loadReviewServerContentBinding(AGREEMENT_ID);
    expect(recorded?.documentId).toBe(REPLACED_DOC);
    expect(recorded?.agreementId).toBe(AGREEMENT_ID);
  });

  it("matching Review content is not rewritten needlessly", async () => {
    const review = reviewServicesAgreement();
    expect(
      resolveServerContentReplaceDecision({
        fetchedPlain: review,
        reviewCorpus: review,
      }).replace,
    ).toBe(false);
    expect(
      resolveServerContentReplaceDecision({
        fetchedPlain: review,
        reviewCorpus: review,
      }).reason,
    ).toBe(REUSE_MATCHING_SERVER_CONTENT_REASON);

    const seed = vi.fn();
    const bound = await bindReviewCorpusOntoSeededVs01Document({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      existingBridgeCorpus: review,
      seed,
      fetchContent: fetchContentOf(review),
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.replaced).toBe(false);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).not.toHaveBeenCalled();

    const hash = "d".repeat(64);
    storeReviewServerContentBinding({
      agreementId: AGREEMENT_ID,
      documentId: SEEDED_DOC,
      corpusHash: "already-recorded",
      contentSha256: hash,
    });
    const recordedReview = resolveServerContentReplaceDecision({
      fetchedPlain: review,
      reviewCorpus: review,
      recordedMatch: true,
    });
    expect(recordedReview.replace).toBe(false);
    expect(recordedReview.matching).toBe(true);

    const recordedUnreadable = resolveServerContentReplaceDecision({
      fetchedPlain: "unreadable-pdf-bytes",
      reviewCorpus: review,
      recordedMatch: true,
    });
    expect(recordedUnreadable.replace).toBe(true);
    expect(recordedUnreadable.matching).toBe(false);
  });

  it("shared Texas/Northline tokens in a template extract must not skip replace", async () => {
    const review = reviewServicesAgreement();
    const sharedTokenExtract = [
      "%PDF-1.4",
      "Northline Studio",
      "Harbor Marks LLC",
      "Texas",
      "$2400",
      "Draft Agreement (non-binding template)",
      "1. SCOPE",
      "8. SIGNATURES",
    ].join("\n");
    expect(fetchedPlainPositivelyMatchesReviewCorpus(sharedTokenExtract, review)).toBe(false);
    expect(
      resolveServerContentReplaceDecision({
        fetchedPlain: sharedTokenExtract,
        reviewCorpus: review,
      }).replace,
    ).toBe(true);

    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "a".repeat(64),
    });
    const bound = await bindReviewCorpusOntoSeededVs01Document({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      seed,
      fetchContent: fetchContentOf(sharedTokenExtract),
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.replaced).toBe(true);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][2]).toMatch(/SERVICES AGREEMENT/);
  });

  it("409 still does not eject to dashboard", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: SEEDED_DOC,
      currentPath: `/app/esign/${SEEDED_DOC}?agreement_bridge=1`,
      recipientAccessTokenStatus: 409,
    });
    expect(landing.stayOnPrivateLinks).toBe(true);
    expect(landing.navigateTo).toBeNull();
    expect(landing.reason).toBe(RECIPIENT_ACCESS_TOKEN_409_STAY_REASON);
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? `/app/esign/${SEEDED_DOC}`)).toBe(
      false,
    );
  });

  it("GET /content extract reads Review or template from plain or PDF literal strings", () => {
    const review = reviewServicesAgreement();
    const template = nonBindingTemplatePacket();
    expect(extractPlainTextFromDocumentContent(new TextEncoder().encode(review))).toBe(review);
    expect(extractPlainTextFromDocumentContent(new TextEncoder().encode(template))).toContain(
      "Draft Agreement (non-binding template)",
    );
    const pdf = `%PDF-1.4\n1 0 obj\n<<>>\nstream\nBT (${template.slice(0, 80)}) Tj ET\nendstream\n`;
    expect(extractPlainTextFromDocumentContent(new TextEncoder().encode(pdf))).toMatch(
      /Draft Agreement/,
    );
  });

  it("#142 client seed refresh still runs as a helper when replacing server content", async () => {
    const review = reviewServicesAgreement();
    const template = nonBindingTemplatePacket();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "e".repeat(64),
    });
    await bindReviewCorpusOntoSeededVs01Document({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      existingBridgeCorpus: template,
      seed,
      fetchContent: fetchContentOf(template),
    });
    const helper = resolveSeededDocumentReuseFromReviewCorpus({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      existingBridgeCorpus: review,
    });
    expect(helper.documentId).toBe(SEEDED_DOC);
    expect(helper.refreshed).toBe(false);
  });

  it("failed seed POST does not claim a Review-painted document", async () => {
    const review = reviewServicesAgreement();
    const seed = vi.fn().mockResolvedValue({
      ok: false,
      reason: "vs01_finalize_failed",
      httpStatus: 503,
    });
    const bound = await bindReviewCorpusOntoSeededVs01Document({
      agreementId: AGREEMENT_ID,
      existingDocumentId: SEEDED_DOC,
      reviewCorpus: review,
      seed,
      fetchContent: fetchContentOf(nonBindingTemplatePacket()),
    });
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.reason).toBe("vs01_finalize_failed");
    expect(loadReviewServerContentBinding(AGREEMENT_ID)).toBeNull();
  });

  it("clearing the binding does not leave a recorded match", () => {
    storeReviewServerContentBinding({
      agreementId: AGREEMENT_ID,
      documentId: SEEDED_DOC,
      corpusHash: "x",
      contentSha256: "f".repeat(64),
    });
    clearReviewServerContentBinding(AGREEMENT_ID);
    expect(loadReviewServerContentBinding(AGREEMENT_ID)).toBeNull();
  });
});
