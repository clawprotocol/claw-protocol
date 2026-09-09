/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { loadVs01CanonicalPacketPortable, storeVs01CanonicalPacketPortable } from "./vs01CanonicalPacketSeed";
import { readSigningPacketStatus, writeSigningPacketStatus } from "./vs01SigningPacketStatusStore";
import {
  recordVs01SignerCompletion,
  resetVs01SignerCompletionInFlightForTests,
} from "./vs01SignerCompletionSync";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import { writePaidProVs01PostSignHandoff } from "./vs01PaidProPostSignHandoff";

const AG = "ag_test361_completion";
const DOC = "doc_test361";
const OWNER_ROLE = "vs01r:ag_test361:i0:owner";
const CP_ROLE = "vs01r:ag_test361:i1:cp";

function witnessCorpus(): string {
  return (
    `${"Paid Pro services agreement corpus. ".repeat(90)}\n\n` +
    `IN WITNESS WHEREOF, the Parties execute this Agreement.\n\nCLIENT:\nOwner Co\n` +
    `By: __________________________\nDate: _____________________________\n\n` +
    `SERVICE PROVIDER:\nCounterparty Co\nBy: __________________________\nDate: _____________________________`
  );
}

function handoff(): PaidProVs01PostSignHandoffV1 {
  return {
    v: 1,
    agreementId: AG,
    agreementTitle: "Services Agreement",
    vs01DocumentId: DOC,
    receiptId: "",
    receiptHashSha256: null,
    savedAt: new Date().toISOString(),
    ownerSignerRoleId: OWNER_ROLE,
    ownerSigningUrl: "https://example.test/owner",
    signers: [
      {
        counterpartyId: "cp1",
        displayName: "Counterparty Co",
        email: "cp@example.test",
        signingUrl: "https://example.test/cp",
        signerRoleId: CP_ROLE,
      },
    ],
    packetPrepareOnly: true,
  };
}

function seedPortable(): void {
  const corpusPlain = witnessCorpus();
  storeVs01CanonicalPacketPortable(DOC, {
    v: 1,
    seed: {
      v: 1,
      documentId: DOC,
      agreementId: AG,
      corpusPlain,
      corpusHash: fingerprintAgreementBody(corpusPlain),
      savedAt: new Date().toISOString(),
    },
    fields: [
      {
        id: "owner_sig",
        counterpartyId: "owner",
        type: "signature",
        page: 9,
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.05,
        assignedPartyIndex: 0,
        assignedSignerRoleId: OWNER_ROLE,
        value: "",
      },
    ],
    roles: [
      {
        roleId: OWNER_ROLE,
        partyIndex: 0,
        partyId: "owner",
        entityName: "Owner Co",
        partyName: "Owner Co",
        roleLabel: "Client",
        signerName: "Owner",
        isEntityParty: true,
        requiresSignature: true,
        vs01CounterpartyId: "owner",
        kind: "owner",
      },
      {
        roleId: CP_ROLE,
        partyIndex: 1,
        partyId: "cp1",
        entityName: "Counterparty Co",
        partyName: "Counterparty Co",
        roleLabel: "Provider",
        signerName: "Counterparty",
        isEntityParty: true,
        requiresSignature: true,
        vs01CounterpartyId: "cp1",
        kind: "counterparty",
      },
    ],
    pageCount: 10,
    witnessPageIndex: 9,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 1,
  });
}

describe("recordVs01SignerCompletion (Test361)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    resetVs01SignerCompletionInFlightForTests();
    writePaidProVs01PostSignHandoff(handoff());
    seedPortable();
  });

  it("syncs to server before updating local packet cache", async () => {
    const order: string[] = [];
    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockImplementation(async () => {
      order.push("server");
      expect(readSigningPacketStatus(AG)?.bySignerKey[OWNER_ROLE]).not.toBe("signed");
      return {
        ok: true,
        fully_executed: false,
        completion_emails_sent: false,
      };
    });
    const statusStore = await import("./vs01SigningPacketStatusStore");
    const originalPatch = statusStore.patchSignerPacketStatus;
    vi.spyOn(statusStore, "patchSignerPacketStatus").mockImplementation((...args) => {
      order.push("local");
      return originalPatch(...args);
    });

    await recordVs01SignerCompletion({
      agreementId: AG,
      documentId: DOC,
      signerRoleId: OWNER_ROLE,
      partyIndex: 0,
      participantId: "owner",
      signingDateIso: "2026-06-07",
    });

    expect(order[0]).toBe("server");
    expect(order).toContain("local");
  });

  it("dedupes concurrent finish requests for the same signer", async () => {
    let calls = 0;
    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockImplementation(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, fully_executed: false };
    });
    const [a, b] = await Promise.all([
      recordVs01SignerCompletion({
        agreementId: AG,
        documentId: DOC,
        signerRoleId: OWNER_ROLE,
        partyIndex: 0,
        participantId: "owner",
      }),
      recordVs01SignerCompletion({
        agreementId: AG,
        documentId: DOC,
        signerRoleId: OWNER_ROLE,
        partyIndex: 0,
        participantId: "owner",
      }),
    ]);
    expect(calls).toBe(1);
    expect(a.serverSynced).toBe(true);
    expect(b.serverSynced).toBe(true);
  });

  it("marks fully signed locally and requests completion emails on final signer", async () => {
    writeSigningPacketStatus({
      agreementId: AG,
      updatedAt: new Date().toISOString(),
      bySignerKey: { [OWNER_ROLE]: "signed", [CP_ROLE]: "waiting" },
      fullySigned: false,
    });
    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockResolvedValue({
      ok: true,
      fully_executed: true,
      completion_emails_sent: true,
    });

    const result = await recordVs01SignerCompletion({
      agreementId: AG,
      documentId: DOC,
      signerRoleId: CP_ROLE,
      partyIndex: 1,
      participantId: "cp1",
      signingDateIso: "2026-06-08",
    });

    expect(result.fullySigned).toBe(true);
    expect(result.completionEmailsSent).toBe(true);
    expect(readSigningPacketStatus(AG)?.fullySigned).toBe(true);
  });

  it("skips server sync for local_ag bridge agreements", async () => {
    const post = vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockResolvedValue({
      ok: true,
      fully_executed: true,
    });

    await recordVs01SignerCompletion({
      agreementId: "local_ag_bridge",
      documentId: DOC,
      signerRoleId: OWNER_ROLE,
      partyIndex: 0,
    });

    expect(post).not.toHaveBeenCalled();
  });

  it("does not attach fullyExecutedSnapshot on the completion POST before the server finalizes", async () => {
    writeSigningPacketStatus({
      agreementId: AG,
      updatedAt: new Date().toISOString(),
      bySignerKey: { [OWNER_ROLE]: "signed", [CP_ROLE]: "waiting" },
      fullySigned: false,
    });
    let posted: Record<string, unknown> | undefined;
    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockImplementation(async (_aid, body) => {
      posted = body as Record<string, unknown>;
      return { ok: true, fully_executed: false, completion_emails_sent: false };
    });

    await recordVs01SignerCompletion({
      agreementId: AG,
      documentId: DOC,
      signerRoleId: CP_ROLE,
      partyIndex: 1,
      participantId: "cp1",
      signingDateIso: "2026-08-25",
    });

    const portable = posted?.portable_packet as { fullyExecutedSnapshot?: unknown } | undefined;
    expect(portable?.fullyExecutedSnapshot).toBeUndefined();
    expect(loadVs01CanonicalPacketPortable(DOC)?.fullyExecutedSnapshot).toBeUndefined();
  });

  it("persists signer signature and date into portable corpus on finish", async () => {
    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockResolvedValue({
      ok: true,
      fully_executed: false,
      completion_emails_sent: false,
    });

    await recordVs01SignerCompletion({
      agreementId: AG,
      documentId: DOC,
      signerRoleId: OWNER_ROLE,
      partyIndex: 0,
      participantId: "owner",
      signingDateIso: "2026-06-07",
      recipientFields: [
        {
          id: "owner_sig",
          counterpartyId: "owner",
          type: "signature",
          page: 9,
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.05,
          assignedSignerRoleId: OWNER_ROLE,
          value: "Owner Signature",
        },
      ],
    });

    const portable = loadVs01CanonicalPacketPortable(DOC);
    expect(portable?.seed.corpusPlain).toMatch(/By: Owner Signature/);
    expect(portable?.seed.corpusPlain).toMatch(/Date: June 7, 2026/);
  });
});
