/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { clearPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruth";
import {
  FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE,
  pickCurrentReviewSotForSigningSeed,
  projectCurrentReviewSotCorpus,
  readAcceptedReviewCorpusFromDraftLike,
  reviewCorpusHasStaleTopLevelSectionOrder,
} from "./vs01CurrentReviewSotForSeed";
import { ensureReviewCorpusOnEsignEntry } from "./vs01EsignRemountReviewBind";
import { REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON } from "./vs01ReviewCorpusServerContent";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SEEDED_DOC = "doc_e959491fdcef431c96052cbb74e0fdaf";

function padCorpus(body: string): string {
  return `${body}\n\n${"The parties agree to perform the stated obligations in good faith. ".repeat(40)}`.trim();
}

/** Current Review SoT — sequential 10/11/12/13. Generic parties, not live deal names. */
function currentReviewSot(): string {
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

/** Older persist/draft snapshot: 13 then 11; 10 jumps to 12. */
function staleReviewSnapshot(): string {
  return padCorpus(
    [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
      "",
      "10. LIABILITY",
      "Each party's aggregate liability is limited to fees paid under this Agreement.",
      "",
      "12. NOTICES",
      "If to Alpha Workshop Beta Counsel LLC:",
      "Attn: ________",
      "",
      "13. MISCELLANEOUS",
      "This Agreement is the entire agreement This Agreement is between Alpha Workshop Beta Counsel LLC ('Service Provider') and Service Provider ('Service Provider').",
      "",
      "11. GOVERNING LAW",
      "This Agreement is governed by the laws of the applicable jurisdiction.",
    ].join("\n"),
  );
}

describe("esign seed writes current Review SoT, not a stale persist snapshot", () => {
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

  it("names the first failing predicate: seed wrote a stale Review snapshot", () => {
    expect(FIRST_FAILING_STALE_REVIEW_SNAPSHOT_SEED_PREDICATE).toBe(
      "esign_seed_writes_stale_review_snapshot_not_current_sot",
    );
    expect(reviewCorpusHasStaleTopLevelSectionOrder(staleReviewSnapshot())).toBe(true);
    expect(reviewCorpusHasStaleTopLevelSectionOrder(currentReviewSot())).toBe(false);
    expect(staleReviewSnapshot()).toMatch(/13\.\s+MISCELLANEOUS[\s\S]*11\.\s+GOVERNING LAW/i);
    expect(staleReviewSnapshot()).toMatch(/10\.\s+LIABILITY[\s\S]*12\.\s+NOTICES/i);
    expect(currentReviewSot()).toMatch(
      /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
    );
  });

  it("prefers sequential Review over an older persist/draft blob", () => {
    const current = currentReviewSot();
    const stale = staleReviewSnapshot();
    const picked = pickCurrentReviewSotForSigningSeed([stale, current]);
    expect(picked).toBe(current);
    expect(reviewCorpusHasStaleTopLevelSectionOrder(picked)).toBe(false);
    expect(picked).toMatch(
      /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
    );
    expect(picked).not.toMatch(/13\.\s+MISCELLANEOUS[\s\S]*11\.\s+GOVERNING LAW/i);
    expect(picked).not.toMatch(/10\.\s+LIABILITY[\s\S]*12\.\s+NOTICES[\s\S]*11\.\s+GOVERNING LAW/i);
  });

  it("projects sequential 10/11/12/13 when only the stale persist blob is present", () => {
    const projected = projectCurrentReviewSotCorpus(staleReviewSnapshot());
    expect(reviewCorpusHasStaleTopLevelSectionOrder(projected)).toBe(false);
    expect(projected).toMatch(
      /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
    );
    expect(projected).not.toMatch(/13\.\s+MISCELLANEOUS[\s\S]*11\.\s+GOVERNING LAW/i);
  });

  it("reads accepted Review corpus from persist, not draft full-text fields", () => {
    const current = currentReviewSot();
    const stale = staleReviewSnapshot();
    expect(
      readAcceptedReviewCorpusFromDraftLike({
        server_full_document_text: stale,
        premium_full_document_text: stale,
        accepted_review_snapshot_v1: { status: "accepted", corpusPlain: current },
      }),
    ).toBe(current);
  });

  it("leftover remount + seed POST sends sequential Review, not 11-after-13", async () => {
    const current = currentReviewSot();
    const stale = staleReviewSnapshot();
    writeAgreementVs01BridgeSession({
      vs01DocumentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Services Agreement",
      agreementCorpusText: stale,
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
      existingBridgeCorpus: stale,
      draft: {
        id: AGREEMENT_ID,
        title: "Services Agreement",
        premium_full_document_text: stale,
        server_full_document_text: stale,
        accepted_review_snapshot_v1: { status: "accepted", corpusPlain: current },
      } as never,
      seed,
      fetchContent: async () => stale,
      fetchAcceptedReviewCorpus: async () => current,
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
    const posted = String(seed.mock.calls[0][2] ?? "");
    expect(posted).toMatch(
      /10\.\s+LIABILITY[\s\S]*11\.\s+GOVERNING LAW[\s\S]*12\.\s+NOTICES[\s\S]*13\.\s+MISCELLANEOUS/i,
    );
    expect(posted).not.toMatch(/13\.\s+MISCELLANEOUS[\s\S]*11\.\s+GOVERNING LAW/i);
    expect(posted).not.toMatch(/10\.\s+LIABILITY[\s\S]*12\.\s+NOTICES[\s\S]*11\.\s+GOVERNING LAW/i);
    expect(reviewCorpusHasStaleTopLevelSectionOrder(posted)).toBe(false);
  });

  it("matching current Review /content is not rewritten", async () => {
    const current = currentReviewSot();
    const seed = vi.fn();
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      reviewCorpus: current,
      seed,
      fetchContent: async () => current,
      fetchAcceptedReviewCorpus: async () => current,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(false);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).not.toHaveBeenCalled();
  });

  it("keeps the same persist id and prefers the same vs01 id", async () => {
    const current = currentReviewSot();
    const stale = staleReviewSnapshot();
    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "e".repeat(64),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      seed,
      fetchContent: async () => stale,
      fetchAcceptedReviewCorpus: async () => current,
      fetchDraft: async () =>
        ({
          id: AGREEMENT_ID,
          title: "Services Agreement",
          premium_full_document_text: stale,
          server_full_document_text: stale,
        }) as never,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed.mock.calls[0][0]).toBe(AGREEMENT_ID);
    expect(seed.mock.calls[0][4]).toBe(SEEDED_DOC);
  });
});
