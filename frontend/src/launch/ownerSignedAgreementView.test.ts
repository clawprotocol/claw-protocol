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
    expect(loaded!.corpusText).toContain("By: Hue Lorrey");
    expect(loaded!.corpusText).toContain("By: Heath Ledger");
    expect(loaded!.html).toContain("Hue Lorrey");
    expect(loaded!.html).toContain("Heath Ledger");
  });
});
