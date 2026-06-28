/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST440_BRIGHT_PEAK, TEST440_HORIZON } from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST461_SIGNER_METADATA } from "../components/agreements/paidProTest461Vs01PreparePacketFixtures";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as vs01SigningPacketServer from "./vs01SigningPacketServer";
import { bootstrapVs01RecipientSigningAuthority } from "./vs01RecipientAuthorityBootstrap";
import {
  buildTest463FourPartyPreparePacket,
  TEST463_AG,
  TEST463_DOC,
  test463RoleByEntity,
} from "./paidProTest463Fixtures";
import {
  ensureSigningPacketStatusFromHandoff,
  readSigningPacketStatus,
} from "./vs01SigningPacketStatusStore";
import {
  recordVs01SignerCompletion,
  resetVs01SignerCompletionInFlightForTests,
} from "./vs01SignerCompletionSync";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";

describe("TEST463B — tampered URL cannot hydrate or complete wrong signer", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    resetVs01SignerCompletionInFlightForTests();
  });

  it("rejects Horizon token + BrightPeak signer_role_id and writes no completion", async () => {
    const { roles, portable, handoff } = buildTest463FourPartyPreparePacket();
    ensureSigningPacketStatusFromHandoff(handoff, roles[0]!.roleId);
    const horizonRole = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(recipientAccessApi, "validateRecipientAccessToken").mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        agreement_id: TEST463_AG,
        mode: "sign",
        locked_version_id: "v1",
        recipient_party_id: horizonRole.partyId,
      },
    });
    vi.spyOn(vs01SigningPacketServer, "fetchPublicVs01SigningPacket").mockResolvedValue({
      ok: true,
      portable,
    });
    const postSpy = vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockResolvedValue({
      ok: true,
      fully_executed: false,
      completion_emails_sent: false,
    });

    const boot = await bootstrapVs01RecipientSigningAuthority({
      agreementId: TEST463_AG,
      documentId: TEST463_DOC,
      recipientAccessToken: "tok_horizon",
      urlSignerRoleId: brightPeakRole.roleId,
      urlCounterpartyId: horizonRole.partyId,
      urlRecipientIndex: 3,
      urlRecipientName: TEST440_HORIZON,
      urlRecipientEmail: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0]!,
    });

    expect(boot.ok).toBe(false);
    if (boot.ok) return;
    expect("mismatch" in boot && boot.mismatch?.code).toBe("url_signer_role_token_mismatch");
    expect(warnSpy).not.toHaveBeenCalled();

    const completion = await recordVs01SignerCompletion({
      agreementId: TEST463_AG,
      documentId: TEST463_DOC,
      signerRoleId: brightPeakRole.roleId,
      participantId: horizonRole.partyId,
      partyIndex: brightPeakRole.partyIndex,
      recipientFields: [],
    });
    expect(completion.serverSynced).toBe(false);
    expect(postSpy).not.toHaveBeenCalled();

    const snap = readSigningPacketStatus(TEST463_AG);
    expect(snap?.bySignerKey[brightPeakRole.roleId]).not.toBe("signed");
    expect(snap?.bySignerKey[horizonRole.roleId]).not.toBe("signed");
    expect(Object.values(snap?.bySignerKey ?? {}).filter((s) => s === "signed").length).toBe(0);
  });
});
