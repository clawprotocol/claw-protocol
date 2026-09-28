/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { AgreementDraft } from "../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { sha256Hex } from "../utils/agreements/hash";
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

  it("renders fully executed signed snapshot when it matches lock-bound digest", async () => {
    const corpusPlain = signedCorpus();
    const digest = await sha256Hex(corpusPlain);
    const draft = {
      id: AG,
      title: "Services Agreement",
      parties: [{ name: "Red Mesa Logistics LLC" }, { name: "Harbor Peak Automation LLC" }],
      accepted_review_snapshot_v1: {
        status: "accepted",
        snapshotId: "crs_locked",
        corpusSha256: digest,
        corpusLength: corpusPlain.length,
        corpusPlain,
      },
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

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft,
      lockedVersionId: "lv-1",
      signingLock: {
        locked_version_id: "lv-1",
        accepted_snapshot_id: "crs_locked",
        accepted_snapshot_digest: digest,
        accepted_snapshot_length: corpusPlain.length,
      },
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("fully_executed_snapshot");
    expect(loaded!.pdfAvailable).toBe(true);
    expect(loaded!.corpusText).toContain("By: Hue Lorrey");
    expect(loaded!.html).toContain("Hue Lorrey");
  });

  it("fails closed when fully executed status has no lock-bound document authority", async () => {
    const agreementPublicVerify = await import("../agreement/agreementPublicVerify");
    const corpus = `${"Consulting services agreement. ".repeat(40)}Maya Chen and Jordan Hale.`;
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: {
        id: AG,
        title: "Consulting Services Agreement",
        parties: [{ name: "Harbor Peak Analytics LLC" }, { name: "Ironvale Manufacturing Inc." }],
        server_full_document_text: corpus,
        audit_log: [{ event_type: "signed", value: { fully_executed: true } }],
      } as unknown as AgreementDraft,
      lockedVersionId: "lv-1",
      signingLock: { locked_version_id: "lv-1" },
    });
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      signature_status: { fully_executed: true, signer_party_count: 2, signatures_recorded: 2 },
    } as never);
    vi.spyOn(agreementWorkspaceApi, "postVs01EnsureSignedSnapshot").mockResolvedValue({
      ok: false,
      snapshot_ready: false,
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).toBeNull();
  });

  it("fails closed when accepted snapshot id does not match the lock binding", async () => {
    const corpusPlain = signedCorpus();
    const digest = await sha256Hex(corpusPlain);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: {
        id: AG,
        title: "Services Agreement",
        parties: [{ name: "Red Mesa Logistics LLC" }],
        accepted_review_snapshot_v1: {
          status: "accepted",
          snapshotId: "crs_other",
          corpusSha256: digest,
          corpusLength: corpusPlain.length,
          corpusPlain,
        },
      } as unknown as AgreementDraft,
      lockedVersionId: "lv-1",
      signingLock: {
        locked_version_id: "lv-1",
        accepted_snapshot_id: "crs_locked",
        accepted_snapshot_digest: digest,
      },
    });

    expect(await loadOwnerSignedAgreementPreview(AG)).toBeNull();
  });

  it("uses reconstructed draft text only when its digest matches the lock binding", async () => {
    const corpus = `${"Consulting services agreement. ".repeat(40)}Maya Chen and Jordan Hale.`;
    const digest = await sha256Hex(corpus);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: {
        id: AG,
        title: "Consulting Services Agreement",
        parties: [{ name: "Harbor Peak Analytics LLC" }, { name: "Ironvale Manufacturing Inc." }],
        server_full_document_text: corpus,
      } as unknown as AgreementDraft,
      lockedVersionId: "lv-1",
      signingLock: {
        locked_version_id: "lv-1",
        accepted_snapshot_id: "crs_locked",
        accepted_snapshot_digest: digest,
      },
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("reconstructed");
    expect(loaded!.corpusText).toContain("Jordan Hale");
  });

  it("stamps persisted signer names on owner-final display without rewriting the accepted digest", async () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const accepted = [
      `This Consulting Services Agreement is entered into by and between ${harbor} ("Consultant") and ${ironvale} ("Client").`,
      "",
      "1. SERVICES",
      "Consultant will provide implementation support.",
      "",
      ...Array.from({ length: 40 }, (_, i) => `${i + 2}. Reserved clause for length.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CONSULTANT:",
      harbor,
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "Date: _____________________________",
      "",
      "CLIENT:",
      ironvale,
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "Date: _____________________________",
      "",
      "ADVISOR:",
      "Alex Rivera",
      "By: __________________________",
      "Name: Alex Rivera",
      "Title: _________________________",
      "Date: _____________________________",
    ].join("\n");
    const digest = await sha256Hex(accepted);
    const draft = {
      id: AG,
      title: "Consulting Services Agreement",
      parties: [
        { id: "p1", name: harbor, role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
        { id: "p2", name: ironvale, role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
        { id: "p3", name: "Alex Rivera", role: "Advisor", signerName: "Alex Rivera", email: "alex.rivera@advisor.test" },
      ],
      accepted_review_snapshot_v1: {
        status: "accepted",
        snapshotId: "crs_locked",
        corpusSha256: digest,
        corpusLength: accepted.length,
        corpusPlain: accepted,
      },
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft,
      lockedVersionId: "lv-1",
      signingLock: {
        locked_version_id: "lv-1",
        accepted_snapshot_id: "crs_locked",
        accepted_snapshot_digest: digest,
        accepted_snapshot_length: accepted.length,
      },
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("accepted_snapshot");
    expect(loaded!.corpusText).toBe(accepted);
    expect(loaded!.corpusText).toMatch(/CONSULTANT:[\s\S]{0,160}Name: _{10,}/);
    expect(loaded!.corpusText).toMatch(/CLIENT:[\s\S]{0,160}Name: _{10,}/);
    expect(loaded!.html).toContain("Pat Harbor");
    expect(loaded!.html).toContain("Sam Ironvale");
    expect(loaded!.html).toContain("Alex Rivera");
    expect(await sha256Hex(loaded!.corpusText)).toBe(digest);
  });

  it("ensures a completed snapshot when fully signed display is only the accepted corpus", async () => {
    const agreementPublicVerify = await import("../agreement/agreementPublicVerify");
    const accepted = `${"Harbor Peak accepted operative terms. ".repeat(40)}\n1. Services\n2. Payment`;
    const digest = await sha256Hex(accepted);
    const draft = {
      id: AG,
      title: "Consulting Services Agreement",
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC" },
        { id: "p2", name: "Ironvale Manufacturing Inc." },
        { id: "p3", name: "Alex Rivera" },
      ],
      audit_log: [{ event_type: "signed", value: { fully_executed: true } }],
      accepted_review_snapshot_v1: {
        status: "accepted",
        snapshotId: "crs_locked",
        corpusSha256: digest,
        corpusLength: accepted.length,
        corpusPlain: accepted,
      },
    } as unknown as AgreementDraft;
    const completed = `${accepted}\n\nCompleted signature block.`;
    const withSnapshot = {
      ...draft,
      vs01_signing_packet_v1: {
        v: 1,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: completed,
          corpus_hash: fingerprintAgreementBody(completed),
          saved_at: "2026-09-27T00:00:00Z",
        },
      },
    } as unknown as AgreementDraft;

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock")
      .mockResolvedValueOnce({
        ok: true,
        draft,
        lockedVersionId: "lv-1",
        signingLock: {
          locked_version_id: "lv-1",
          accepted_snapshot_id: "crs_locked",
          accepted_snapshot_digest: digest,
          accepted_snapshot_length: accepted.length,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        draft: withSnapshot,
        lockedVersionId: "lv-1",
        signingLock: {
          locked_version_id: "lv-1",
          accepted_snapshot_id: "crs_locked",
          accepted_snapshot_digest: digest,
        },
      });
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      signature_status: { fully_executed: true, signer_party_count: 3, signatures_recorded: 3 },
    } as never);
    vi.spyOn(agreementWorkspaceApi, "postVs01EnsureSignedSnapshot").mockResolvedValue({
      ok: true,
      snapshot_ready: true,
      snapshot_source: "reconstructed",
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(agreementWorkspaceApi.postVs01EnsureSignedSnapshot).toHaveBeenCalledWith(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.pdfAvailable).toBe(true);
    expect(loaded!.pdfPending).toBe(false);
    expect(loaded!.corpusSource).toBe("fully_executed_snapshot");
    expect(loaded!.corpusText).toContain("Completed signature block.");
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

  it("marks PDF available when ensure repairs even if refresh still paints Review", async () => {
    const agreementPublicVerify = await import("../agreement/agreementPublicVerify");
    const reviewPlain = `${"Certified Review commercial agreement. ".repeat(80)}\n1. Services\n2. Payment`;
    const draft = {
      id: AG,
      title: "Northline Services Agreement",
      parties: [{ name: "Northline Studio" }, { name: "Harbor Marks LLC" }],
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
      snapshot_ready: true,
      snapshot_source: "accepted_review",
    });

    const loaded = await loadOwnerSignedAgreementPreview(AG);
    expect(agreementWorkspaceApi.postVs01EnsureSignedSnapshot).toHaveBeenCalledWith(AG);
    expect(loaded).not.toBeNull();
    expect(loaded!.corpusSource).toBe("accepted_review");
    expect(loaded!.pdfAvailable).toBe(true);
    expect(loaded!.corpusText).toContain("Certified Review commercial agreement");
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
