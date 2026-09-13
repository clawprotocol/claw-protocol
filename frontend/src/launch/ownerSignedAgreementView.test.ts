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
    expect(loaded!.corpusSource).toBe("accepted_snapshot");
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
});
