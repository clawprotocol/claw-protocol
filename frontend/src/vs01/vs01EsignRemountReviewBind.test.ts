/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { replacePaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruthState";
import { clearPaidProSourceOfTruth, hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import {
  FIRST_FAILING_ESIGN_REMOUNT_PREDICATE,
  ensureReviewCorpusOnEsignEntry,
  resolveEsignEntryReviewBindContext,
} from "./vs01EsignRemountReviewBind";
import { REPLACE_STALE_SERVER_TEMPLATE_CONTENT_REASON } from "./vs01ReviewCorpusServerContent";
import {
  RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
  isPaidProPacketReadyDashboardPath,
  resolvePostPrepareBuyerSurface,
} from "./vs01PrivateSigningLinksLanding";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SEEDED_DOC = "doc_e959491fdcef431c96052cbb74e0fdaf";

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
      "8. SIGNATURES",
      "Northline Studio",
      "Harbor Marks LLC",
    ].join("\n"),
  );
}

describe("esign remount binds Review corpus before paint", () => {
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

  it("names the first failing predicate: remount painted template without bind", () => {
    expect(FIRST_FAILING_ESIGN_REMOUNT_PREDICATE).toBe(
      "esign_remount_paints_template_content_without_bind",
    );
  });

  it("esign remount of a stale template forces vs01-signing-seed POST", async () => {
    const review = reviewServicesAgreement();
    const template = nonBindingTemplatePacket();
    writeAgreementVs01BridgeSession({
      vs01DocumentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Services Agreement",
      agreementCorpusText: review,
      creatorName: "Northline Studio",
      creatorEmail: "priya@example.test",
      counterparties: [],
      targetStep: 2,
      senderFirstLawdogHandoff: true,
      reviewerApprovedCleanHandoff: true,
    });
    replacePaidProSourceOfTruth({
      text: review,
      hash: hashPaidProCorpus(review),
      accepted_at: Date.now(),
      source: "server_full_draft",
    });

    const ctx = resolveEsignEntryReviewBindContext(SEEDED_DOC);
    expect(ctx?.agreementId).toBe(AGREEMENT_ID);

    const seed = vi.fn().mockResolvedValue({
      ok: true,
      documentId: SEEDED_DOC,
      contentSha256: "b".repeat(64),
    });
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      seed,
      fetchContent: async () => template,
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
    expect(seed).toHaveBeenCalledWith(
      AGREEMENT_ID,
      null,
      review,
      FIRST_FAILING_ESIGN_REMOUNT_PREDICATE,
      SEEDED_DOC,
    );
    expect(seed.mock.calls[0][2]).toMatch(/SERVICES AGREEMENT/);
    expect(seed.mock.calls[0][2]).not.toMatch(/Draft Agreement \(non-binding template\)/i);
  });

  it("matching Review /content is not rewritten needlessly on remount", async () => {
    const review = reviewServicesAgreement();
    writeAgreementVs01BridgeSession({
      vs01DocumentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Services Agreement",
      agreementCorpusText: review,
      creatorName: "Owner",
      creatorEmail: "owner@example.test",
      counterparties: [],
      targetStep: 2,
      senderFirstLawdogHandoff: true,
    });
    const seed = vi.fn();
    const bound = await ensureReviewCorpusOnEsignEntry({
      documentId: SEEDED_DOC,
      seed,
      fetchContent: async () => review,
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok || "skipped" in bound) return;
    expect(bound.replaced).toBe(false);
    expect(bound.documentId).toBe(SEEDED_DOC);
    expect(seed).not.toHaveBeenCalled();
  });

  it("409 still does not eject after remount bind", () => {
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
});
