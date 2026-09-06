/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { AgreementDraft } from "../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { loadOwnerSignedAgreementPreview } from "./ownerSignedAgreementView";

const AG = "ag_test362_owner_view";
const WITNESS_TAIL = `
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: Hue Lorrey
Name: Hue Lorrey
Title: CEO
Date: June 15, 2026

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: Heath Ledger
Name: Heath Ledger
Title: Member
Date: June 16, 2026`;

function signedCorpus(): string {
  return `${"Services agreement corpus. ".repeat(90)}\n${WITNESS_TAIL}`;
}

describe("loadOwnerSignedAgreementPreview (Test362)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fully executed signed snapshot instead of unsigned canonical corpus", async () => {
    const corpusPlain = signedCorpus();
    const draft = {
      id: AG,
      title: "Services Agreement",
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      vs01_signing_packet_v1: {
        v: 1,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: corpusPlain,
          corpus_hash: fingerprintAgreementBody(corpusPlain),
          saved_at: "2026-06-16T00:00:00Z",
        },
      },
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft,
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("fully_executed_snapshot");
    expect(loaded!.pdfAvailable).toBe(true);
    expect(loaded!.corpusText).toContain("By: Hue Lorrey");
    expect(loaded!.corpusText).toContain("By: Heath Ledger");
    expect(loaded!.html).toContain("Hue Lorrey");
    expect(loaded!.html).toContain("Heath Ledger");
  });

  it("calls ensure endpoint when fully executed but server snapshot missing", async () => {
    const agreementPublicVerify = await import("../agreement/agreementPublicVerify");
    const unsignedCorpus =
      `${"Services agreement corpus. ".repeat(90)}\n` +
      `IN WITNESS WHEREOF, the Parties execute this Agreement.\n\nCLIENT:\nRed Mesa Logistics LLC\n` +
      `By: __________________________\nDate: _____________________________\n\n` +
      `SERVICE PROVIDER:\nHarbor Peak Automation LLC\nBy: __________________________\nDate: _____________________________`;
    const corpusPlain = unsignedCorpus;
    const draftWithoutSnap = {
      id: AG,
      title: "Services Agreement",
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      audit_log: [{ event_type: "signed", value: { fully_executed: true } }],
      vs01_signing_packet_v1: {
        v: 1,
        portable: {
          v: 1,
          seed: {
            v: 1,
            documentId: "doc1",
            agreementId: AG,
            corpusPlain,
            corpusHash: fingerprintAgreementBody(corpusPlain),
            savedAt: "2026-06-16T00:00:00Z",
          },
          fields: [],
          roles: [],
          pageCount: 10,
          witnessPageIndex: 9,
          initialsPolicy: { enabled: false, bodyPagesOnly: true },
          fieldCount: 0,
        },
      },
    } as unknown as AgreementDraft;

    const draftWithSnap = {
      ...draftWithoutSnap,
      vs01_signing_packet_v1: {
        v: 1,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: corpusPlain,
          corpus_hash: fingerprintAgreementBody(corpusPlain),
          saved_at: "2026-06-16T00:00:00Z",
        },
      },
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft")
      .mockResolvedValueOnce({ ok: true, draft: draftWithoutSnap })
      .mockResolvedValueOnce({ ok: true, draft: draftWithSnap });
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      signature_status: { fully_executed: true, signer_party_count: 2, signatures_recorded: 2 },
    } as never);
    vi.spyOn(agreementWorkspaceApi, "postVs01EnsureSignedSnapshot").mockResolvedValue({
      ok: true,
      snapshot_ready: true,
      snapshot_source: "reconstructed",
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(agreementWorkspaceApi.postVs01EnsureSignedSnapshot).toHaveBeenCalledWith(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("fully_executed_snapshot");
    expect(loaded!.pdfAvailable).toBe(true);
  });

  it("paints fully_executed snapshot when By/Name invariant rejects and portable is absent", async () => {
    const corpusPlain =
      `${"Consulting services agreement body. ".repeat(40)}\n` +
      `IN WITNESS WHEREOF, the Parties execute this Agreement.\n\n` +
      `CLIENT:\nNorthline Logistics LLC\nBy: Hue Lorrey\nName: Northline Logistics LLC\nDate: June 15, 2026\n\n` +
      `SERVICE PROVIDER:\nHarbor Peak Automation LLC\nBy: Heath Ledger\nName: Harbor Peak Automation LLC\nDate: June 16, 2026`;
    const draft = {
      id: AG,
      title: "Services Agreement",
      parties: [{ name: "Northline Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      audit_log: [{ event_type: "signed", value: { fully_executed: true } }],
      vs01_signing_packet_v1: {
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: corpusPlain,
          corpus_hash: fingerprintAgreementBody(corpusPlain),
          saved_at: "2026-06-16T00:00:00Z",
        },
      },
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft,
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("fully_executed_snapshot");
    expect(loaded!.pdfAvailable).toBe(true);
    expect(loaded!.corpusText).toContain("By: Hue Lorrey");
    expect(loaded!.html).toContain("Northline Logistics LLC");
  });

  it("paints certified Review when fully_executed snapshot is missing after ensure", async () => {
    const agreementPublicVerify = await import("../agreement/agreementPublicVerify");
    const reviewPlain = `${"Certified Review commercial agreement. ".repeat(80)}\n1. Services\n2. Payment`;
    const draft = {
      id: AG,
      title: "Northline Services Agreement",
      parties: [{ name: "Northline Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      audit_log: [{ event_type: "signed", value: { fully_executed: true } }],
      accepted_review_snapshot_v1: {
        status: "accepted",
        corpus_plain: reviewPlain,
      },
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft,
    });
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      signature_status: { fully_executed: true, signer_party_count: 2, signatures_recorded: 2 },
    } as never);
    vi.spyOn(agreementWorkspaceApi, "postVs01EnsureSignedSnapshot").mockResolvedValue({
      ok: true,
      snapshot_ready: false,
      snapshot_source: "missing",
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(agreementWorkspaceApi.postVs01EnsureSignedSnapshot).toHaveBeenCalledWith(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("accepted_review");
    expect(loaded!.pdfAvailable).toBe(false);
    expect(loaded!.corpusText).toContain("Certified Review commercial agreement");
    expect(loaded!.html).toContain("Certified Review commercial agreement");
  });

  it("returns null for fully_executed empty-corpus path so the page can hide dead PDF", async () => {
    const agreementPublicVerify = await import("../agreement/agreementPublicVerify");
    const draft = {
      id: AG,
      title: "Services Agreement",
      parties: [{ name: "Northline Logistics LLC" }],
      audit_log: [{ event_type: "signed", value: { fully_executed: true } }],
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft,
    });
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      signature_status: { fully_executed: true, signer_party_count: 2, signatures_recorded: 2 },
    } as never);
    vi.spyOn(agreementWorkspaceApi, "postVs01EnsureSignedSnapshot").mockResolvedValue({
      ok: false,
      error: "signed_snapshot_unavailable",
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).toBeNull();
  });
});
