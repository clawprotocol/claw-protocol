/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { clearPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruth";
import { normalizeAgreementDraftFromApi } from "../agreement/agreementDraftNormalize";
import {
  FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE,
  pickCurrentReviewSotForSigningSeed,
  readAcceptedReviewCorpusFromDraftLike,
  resolveCertifiedReviewCorpusForSigningSeed,
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
      "",
      "If to Beta Counsel LLC:",
      "Attn: Signer Two",
      "Email: signer@example.test",
      "",
      "13. MISCELLANEOUS",
      "This Agreement constitutes the entire agreement of the parties.",
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

  it("names the first failing predicate: seed wrote a non-certified Review version", () => {
    expect(FIRST_FAILING_NON_CERTIFIED_REVIEW_SEED_PREDICATE).toBe(
      "esign_seed_writes_non_certified_review_version",
    );
    expect(certifiedReview()).toMatch(/If to Alpha Workshop:/);
    expect(leftoverFusedReview()).toMatch(/If to Alpha Workshop Beta Counsel LLC/);
    expect(leftoverFusedReview()).toMatch(
      /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
    );
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
});
