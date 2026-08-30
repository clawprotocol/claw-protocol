/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { clearPaidProSourceOfTruth, hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruthState";
import { normalizeAgreementDraftFromApi } from "../agreement/agreementDraftNormalize";
import {
  FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTED_PREDICATE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
  FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE,
  FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE,
  persistReviewGetPlainForSigningSeed,
  pickCurrentReviewSotForSigningSeed,
  readAcceptedReviewCorpusFromDraftLike,
  resolveCertifiedReviewCorpusForSigningSeed,
  reviewCorpusLooksLikeLeftoverFusedNotices,
} from "./vs01CurrentReviewSotForSeed";
import { resolveAgreementCorpusForPrepareHandoff } from "./vs01PrepareBridgeCorpus";
import { ensureReviewCorpusOnEsignEntry } from "./vs01EsignRemountReviewBind";
import { REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON } from "./vs01ReviewCorpusServerContent";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SEEDED_DOC = "doc_e959491fdcef431c96052cbb74e0fdaf";

function padCorpus(body: string): string {
  return `${body}\n\n${"The parties agree to perform the stated obligations in good faith. ".repeat(40)}`.trim();
}

/** Certified Review — sequential 10/11/12/13, independent Notices If-to. Generic parties. */
function certifiedReview(): string {
  return padCorpus(
    [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
      "",
      "2. TERM",
      "This Agreement commences Upon full execution by the parties unless otherwise specified and continues for 30 days.",
      "",
      "10. LIABILITY",
      "Each party's aggregate liability is limited to fees paid under this Agreement.",
      "",
      "11. GOVERNING LAW",
      "This Agreement is governed by the laws of the applicable jurisdiction.",
      "",
      "12. NOTICES",
      "If to Alpha Workshop:",
      "Attn: Owner One",
      "Email: owner@example.test",
      "Address:",
      "100 Workshop Lane",
      "",
      "If to Beta Counsel LLC:",
      "Attn: Signer Two",
      "Email: signer@example.test",
      "Address:",
      "",
      "13. MISCELLANEOUS",
      "This Agreement constitutes the entire agreement of the parties. Notices are effective 30 days after delivery.",
    ].join("\n"),
  );
}

/**
 * Leftover persist/draft blob after #145 order restore: already sequential
 * 10/11/12/13, but fused Notices / Misc — not the certified Review.
 */
function leftoverFusedReview(): string {
  return padCorpus(
    [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
      "",
      "10. LIABILITY",
      "Each party's aggregate liability is limited to fees paid under this Agreement.",
      "",
      "11. GOVERNING LAW",
      "This Agreement is governed by the laws of the applicable jurisdiction.",
      "",
      "12. NOTICES",
      "If to Alpha Workshop Beta Counsel LLC:",
      "Alpha Workshop Beta Counsel LLC",
      "Attn: ________, ________",
      "Email: ________",
      "",
      "If to Beta Counsel LLC:",
      "Beta Counsel LLC",
      "Address: 30 days, Upon full execution by the parties unless otherwise specified.",
      "",
      "13. MISCELLANEOUS",
      "This Agreement is the entire agreement This Agreement is between Alpha Workshop Beta Counsel LLC ('Service Provider') and Service Provider ('Service Provider').",
    ].join("\n"),
  );
}

function expectCertifiedSeedBody(posted: string): void {
  expect(posted).toBe(certifiedReview());
  expect(posted).toMatch(
    /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
  );
  expect(posted).toMatch(/If to Alpha Workshop:\s*\n[\s\S]*If to Beta Counsel LLC:/i);
  expect(posted).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
  expect(posted).not.toMatch(/Alpha Workshop Beta Counsel LLC/i);
  expect(posted).not.toMatch(
    /This Agreement is the entire agreement This Agreement is between/i,
  );
}

describe("esign seed writes certified Review, not a leftover fused version", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPaidProSourceOfTruth();
  });

  it("names the first failing predicate: leftover fallback when certified unresolved", () => {
    expect(FIRST_FAILING_LEFTOVER_FUSED_FALLBACK_PREDICATE).toBe(
      "esign_seed_falls_back_to_leftover_fused_draft_when_certified_unresolved",
    );
    expect(FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTED_PREDICATE).toBe(
      "esign_fail_closed_or_wrong_store_leaves_leftover_get_content_painted",
    );
    expect(FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE).toBe(
      "esign_leftover_get_content_still_paints_after_review_paint_sot_resolver",
    );
    expect(FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE).toBe(
      "esign_leftover_get_content_paints_before_persist_review_replace",
    );
    expect(FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE).toBe(
      "esign_seed_writes_non_certified_review_version",
    );
    expect(certifiedReview()).toMatch(/If to Alpha Workshop:/);
    expect(leftoverFusedReview()).toMatch(/If to Alpha Workshop Beta Counsel LLC/);
    expect(leftoverFusedReview()).toMatch(
      /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
    );
    expect(reviewCorpusLooksLikeLeftoverFusedNotices(leftoverFusedReview())).toBe(true);
    expect(
      reviewCorpusLooksLikeLeftoverFusedNotices(
        [
          "If to Alpha Workshop Beta Counsel LLC: Alpha Workshop Beta Counsel LLC Attn: ________",
          "If to Beta Counsel LLC: Address: 30 days, Upon full execution by the parties unless otherwise specified.",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(
      reviewCorpusLooksLikeLeftoverFusedNotices(
        [
          "If to Alpha Workshop Beta Counsel LLC:",
          "If to Beta Counsel LLC:",
          "Address:",
          "30 days, Upon full execution by the parties unless otherwise specified.",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(reviewCorpusLooksLikeLeftoverFusedNotices(certifiedReview())).toBe(false);
    expect(
      reviewCorpusLooksLikeLeftoverFusedNotices(
        [
          "If to Beta Counsel LLC:",
          "Address: User-stated material terms:, 30-day term, Texas governing law",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(resolveCertifiedReviewCorpusForSigningSeed(leftoverFusedReview())).toBe("");
    expect(resolveCertifiedReviewCorpusForSigningSeed(certifiedReview())).toBe(certifiedReview());
    expect(persistReviewGetPlainForSigningSeed(certifiedReview())).toBe(certifiedReview());
    // Persist Review GET 200 is the replace body — do not leftover-filter it empty.
    expect(persistReviewGetPlainForSigningSeed(leftoverFusedReview())).toBe(leftoverFusedReview());
    expect(
      reviewCorpusLooksLikeLeftoverFusedNotices(
        [
          "12. NOTICES",
          "If to Alpha Workshop:",
          "Address: 100 Workshop Lane 2. TERM This Agreement commences Upon full execution by the parties unless otherwise specified and continues for 30 days.",
          "13. MISCELLANEOUS",
          "Notices are effective 30 days after delivery.",
        ].join("\n"),
      ),
    ).toBe(false);
  });

  it("persist Review snapshot with Notices Address plus later Term/Misc is not leftover-filtered empty", () => {
    const persistReview = certifiedReview();
    expect(persistReview).toMatch(/Address:/);
    expect(persistReview).toMatch(/Upon full execution by the parties unless otherwise specified/);
    expect(persistReview).toMatch(/30 days/);
    expect(reviewCorpusLooksLikeLeftoverFusedNotices(persistReview)).toBe(false);
    expect(persistReviewGetPlainForSigningSeed(persistReview)).toBe(persistReview);
    expect(persistReviewGetPlainForSigningSeed(persistReview)).not.toBe("");
  });

  it("uses certified Review as-is and does not project leftover into it", () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    expect(resolveCertifiedReviewCorpusForSigningSeed(certified)).toBe(certified);
    expect(pickCurrentReviewSotForSigningSeed([certified, leftover])).toBe(certified);
    expect(resolveCertifiedReviewCorpusForSigningSeed(certified)).not.toMatch(
      /If to Alpha Workshop Beta Counsel LLC/i,
    );
  });

  it("prepare handoff prefers accepted Review over sequential leftover draft fields", () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const resolved = resolveAgreementCorpusForPrepareHandoff({
      agreementId: AGREEMENT_ID,
      draft: {
        id: AGREEMENT_ID,
        title: "Services Agreement",
        premium_full_document_text: leftover,
        server_full_document_text: leftover,
        accepted_review_snapshot_v1: { status: "accepted", corpusPlain: certified },
      } as never,
      bridgeCorpusText: leftover,
    });
    expectCertifiedSeedBody(resolved);
  });

  it("reads accepted Review corpus from persist, not draft full-text fields", () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    expect(
      readAcceptedReviewCorpusFromDraftLike({
        server_full_document_text: leftover,
        premium_full_document_text: leftover,
        accepted_review_snapshot_v1: { status: "accepted", corpusPlain: certified },
      }),
    ).toBe(certified);
  });

  it("normalize keeps accepted Review snapshot corpus for leftover remount", () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const normalized = normalizeAgreementDraftFromApi(
      {
        id: AGREEMENT_ID,
        title: "Services Agreement",
        premium_full_document_text: leftover,
        server_full_document_text: leftover,
        accepted_review_snapshot_v1: { status: "accepted", corpusPlain: certified },
      },
      { fallbackAgreementId: AGREEMENT_ID },
    );
    expect(readAcceptedReviewCorpusFromDraftLike(normalized)).toBe(certified);
  });

  it("leftover remount + seed POST writes certified Review, not fused leftover", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    writeAgreementVs01BridgeSession({
      vs01DocumentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Services Agreement",
      agreementCorpusText: leftover,
      creatorName: "Alpha Workshop",
      creatorEmail: "owner@example.test",
      counterparties: [],
      targetStep: 2,
      senderFirstLawdogHandoff: true,
    });

    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "a".repeat(64),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      existingBridgeCorpus: leftover,
      draft: {
        id: AGREEMENT_ID,
        title: "Services Agreement",
        premium_full_document_text: leftover,
        server_full_document_text: leftover,
        accepted_review_snapshot_v1: { status: "accepted", corpusPlain: certified },
      } as never,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => certified,
    });

    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) {
      expect("skipped" in bound).toBe(false);
      return;
    }
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reason).toBe(REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
  });

  it("Incognito remount hydrates certified Review when draft fields are leftover", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "b".repeat(64),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => certified,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).toHaveBeenCalledTimes(1);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
  });

  it("matching certified Review /content is not rewritten", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn();
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      seed,
      fetchContent: async () => certified,
      fetchAcceptedReviewCorpus: async () => certified,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(false);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).not.toHaveBeenCalled();
  });

  it("keeps the same persist id and prefers the same vs01 id", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "e".repeat(64),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => certified,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
  });

  it("leftover remount with empty accepted snapshot hydrates certified Review and seeds that", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "c".repeat(64),
    });
    const hydrate = vi.fn().mockResolvedValue(certified);
    const persistGet = vi.fn();
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: hydrate,
      fetchPersistReviewGet: persistGet,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(hydrate).toHaveBeenCalledWith(AGREEMENT_ID);
    expect(persistGet).not.toHaveBeenCalled();
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).toHaveBeenCalledTimes(1);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(
      /Address:\s*30 days, Upon full execution by the parties unless otherwise specified/i,
    );
  });

  it("empty accepted snapshot still seeds paid Pro accepted display Review-paint SoT", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    replacePaidProSourceOfTruth({
      text: certified,
      hash: hashPaidProCorpus(certified),
      accepted_at: Date.now(),
      source: "server_full_draft",
    });
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "10".repeat(32),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => leftover,
      fetchPersistReviewGet: async () => leftover,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
  });

  it("leftover remount with empty accepted snapshot still seeds the Review-paint corpus", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "f".repeat(64),
    });
    const reviewPaint = vi.fn().mockResolvedValue(certified);
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: async () => "",
      fetchReviewPaintSot: reviewPaint,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(reviewPaint).toHaveBeenCalledWith(AGREEMENT_ID);
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reason).toBe(REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(
      /Address:\s*30 days, Upon full execution by the parties unless otherwise specified/i,
    );
  });

  it("leftover hydrate/canonical store is rejected; Review-paint SoT is seeded instead", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "11".repeat(32),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => leftover,
      fetchPersistReviewGet: async () => leftover,
      fetchReviewPaintSot: async () => certified,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
          accepted_review_snapshot_v1: { status: "accepted", corpusPlain: leftover },
        }) as never,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).toHaveBeenCalledTimes(1);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
  });

  it("persist Review GET still resolves certified when hydrate is empty", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "d".repeat(64),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: async () => certified,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
  });

  it("leftover remount with empty Incognito Review-paint still seeds persist Review GET", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "12".repeat(32),
    });
    const persistGet = vi.fn().mockResolvedValue(certified);
    const reviewPaint = vi.fn().mockResolvedValue("");
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: persistGet,
      fetchReviewPaintSot: reviewPaint,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(persistGet).toHaveBeenCalledWith(AGREEMENT_ID);
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reason).toBe(REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(
      /Address:\s*30 days, Upon full execution by the parties unless otherwise specified/i,
    );
  });

  it("fail closed: only when persist Review truly does not exist; leftover on screen is not a pass", async () => {
    const leftover = leftoverFusedReview();
    const seed = vi.fn();
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => leftover,
      fetchPersistReviewGet: async () => leftover,
      fetchReviewPaintSot: async () => "",
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.reason).toBe(FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE);
    expect(seed).not.toHaveBeenCalled();
  });

  it("leftover remount + leftover GET refuse + persist Review GET 200 + empty session seeds persist Review", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "13".repeat(32),
    });
    const persistGet = vi.fn().mockResolvedValue(certified);
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => {
        throw new Error(
          JSON.stringify({
            code: FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
            error: "leftover_fused_content",
          }),
        );
      },
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: persistGet,
      fetchReviewPaintSot: async () => "",
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(persistGet).toHaveBeenCalledWith(AGREEMENT_ID);
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reviewCorpus).toBe(certified);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toBe(leftover);
  });

  it("leftover remount + leftover GET /content 200 + persist Review GET 200 seeds persist Review and leftover fused is never seed", async () => {
    const certified = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "14".repeat(32),
    });
    const persistGet = vi.fn().mockResolvedValue(certified);
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: persistGet,
      fetchReviewPaintSot: async () => "",
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(persistGet).toHaveBeenCalledWith(AGREEMENT_ID);
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reviewCorpus).toBe(certified);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expectCertifiedSeedBody(String(seed.mock.calls[0][2] ?? ""));
    expect(String(seed.mock.calls[0][2] ?? "")).not.toBe(leftover);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(
      /Address:\s*30 days, Upon full execution by the parties unless otherwise specified/i,
    );
  });

  it("leftover remount + leftover GET 200 + persist Review GET with Address plus later Term seeds persist Review", async () => {
    const persistReview = certifiedReview();
    const leftover = leftoverFusedReview();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "15".repeat(32),
    });
    const persistGet = vi.fn().mockResolvedValue(persistReview);
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: persistGet,
      fetchReviewPaintSot: async () => "",
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(persistGet).toHaveBeenCalledWith(AGREEMENT_ID);
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(true);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(bound.reviewCorpus).toBe(persistReview);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][2]).toBe(persistReview);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toBe(leftover);
    expect(String(seed.mock.calls[0][2] ?? "")).not.toMatch(/If to Alpha Workshop Beta Counsel LLC/i);
  });

  it("fail-closed only when persist Review GET is truly missing", async () => {
    const leftover = leftoverFusedReview();
    const seed = vi.fn();
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: leftover,
      existingBridgeCorpus: leftover,
      seed,
      fetchContent: async () => leftover,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: async () => "",
      fetchReviewPaintSot: async () => "",
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: leftover,
          server_full_document_text: leftover,
        }) as never,
    });
    expect(bound.ok).toBe(false);
    if (bound.ok) return;
    expect(bound.reason).toBe(FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE);
    expect(seed).not.toHaveBeenCalled();
  });

  it("leftover remount bind never picks leftover draft/bridge/handoff as seed SoT", () => {
    const remount = readFileSync(join(__dirname, "vs01EsignRemountReviewBind.ts"), "utf8");
    expect(remount).toContain("FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE");
    expect(remount).toContain("FIRST_FAILING_LEFTOVER_GET_CONTENT_STILL_PAINTS_PREDICATE");
    expect(remount).toContain("fetchReviewPaintSot");
    expect(remount).toContain("resolvePaidProFirstReviewVisibleDisplayPlain");
    expect(remount).toContain("resolveCanonicalPlainForVisibleShell");
    expect(remount).toContain("fetchPersistReviewGet");
    expect(remount).toContain("persistReviewGetPlainForSigningSeed");
    expect(remount).toContain("hydrateCommercialReviewFromServerSnapshot");
    expect(remount).toContain("fetchCanonicalReviewSnapshot");
    expect(remount).not.toContain("resolveAgreementCorpusForPrepareHandoff");
    expect(remount).not.toContain("pickCurrentReviewSotForSigningSeed");
  });
});
