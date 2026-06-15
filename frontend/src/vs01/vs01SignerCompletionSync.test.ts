/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { storeVs01CanonicalPacketPortable } from "./vs01CanonicalPacketSeed";
import { readSigningPacketStatus, writeSigningPacketStatus } from "./vs01SigningPacketStatusStore";
import { recordVs01SignerCompletion } from "./vs01SignerCompletionSync";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import { writePaidProVs01PostSignHandoff } from "./vs01PaidProPostSignHandoff";

const AG = "ag_test361_completion";
const DOC = "doc_test361";
const OWNER_ROLE = "vs01r:ag_test361:i0:owner";
const CP_ROLE = "vs01r:ag_test361:i1:cp";

function witnessCorpus(): string {
  return (
    `${"Paid Pro services agreement corpus. ".repeat(90)}\n\n` +
    `IN WITNESS WHEREOF\n\nCLIENT:\nOwner Co\nDate: _____________________________\n\n` +
    `SERVICE PROVIDER:\nCounterparty Co\nDate: _____________________________`
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
    fields: [],
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
    fieldCount: 0,
  });
}

describe("recordVs01SignerCompletion (Test361)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    writePaidProVs01PostSignHandoff(handoff());
    seedPortable();
  });

  it("bootstraps packet status and syncs first signer to server", async () => {
    const post = vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockResolvedValue({
      ok: true,
      fully_executed: false,
      completion_emails_sent: false,
    });

    const result = await recordVs01SignerCompletion({
      agreementId: AG,
      documentId: DOC,
      signerRoleId: OWNER_ROLE,
      partyIndex: 0,
      participantId: "owner",
      signingDateIso: "2026-06-07",
    });

    expect(result.serverSynced).toBe(true);
    expect(result.fullySigned).toBe(false);
    const snap = readSigningPacketStatus(AG);
    expect(snap?.bySignerKey[OWNER_ROLE]).toBe("signed");
    expect(snap?.bySignerKey[CP_ROLE]).toBe("waiting");
    expect(post).toHaveBeenCalledOnce();
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
});
