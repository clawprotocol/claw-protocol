/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST461_SIGNER_METADATA } from "../components/agreements/paidProTest461Vs01PreparePacketFixtures";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { storeVs01CanonicalPacketPortable } from "./vs01CanonicalPacketSeed";
import {
  buildTest463FourPartyPreparePacket,
  TEST463_AG,
  TEST463_DOC,
  test463RoleByEntity,
} from "./paidProTest463Fixtures";
import { bootstrapVs01RecipientSigningAuthority } from "./vs01RecipientAuthorityBootstrap";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as vs01SigningPacketServer from "./vs01SigningPacketServer";
import {
  ensureSigningPacketStatusFromHandoff,
  readSigningPacketStatus,
} from "./vs01SigningPacketStatusStore";
import {
  recordVs01SignerCompletion,
  resetVs01SignerCompletionInFlightForTests,
} from "./vs01SignerCompletionSync";
import { countSignedSigners } from "./vs01SigningPacketStatusCards";
import { readLocalSigningProgressSnapshot } from "./vs01WorkspaceSigningStatus";
import { recipientFieldBelongsToLockedSigner } from "./vs01SignerFieldAssignment";

describe("TEST463C — Horizon completion persists canonical identity and dashboard 1/4", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    resetVs01SignerCompletionInFlightForTests();
  });

  it("records Horizon participant only and leaves other parties unsigned", async () => {
    const { roles, portable, handoff } = buildTest463FourPartyPreparePacket();
    storeVs01CanonicalPacketPortable(TEST463_DOC, portable);
    ensureSigningPacketStatusFromHandoff(handoff, roles[0]!.roleId);

    const horizonRole = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);
    const evergreenRole = test463RoleByEntity(TEST440_EVERGREEN, roles);
    const atlasRole = test463RoleByEntity(TEST440_ATLAS, roles);

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

    const boot = await bootstrapVs01RecipientSigningAuthority({
      agreementId: TEST463_AG,
      documentId: TEST463_DOC,
      recipientAccessToken: "tok_horizon",
      urlSignerRoleId: horizonRole.roleId,
      urlCounterpartyId: horizonRole.partyId,
      urlRecipientIndex: horizonRole.partyIndex,
      urlRecipientName: TEST440_HORIZON,
      urlRecipientEmail: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0]!,
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;

    expect(boot.identity.lockedSignerRoleId).toBe(horizonRole.roleId);
    expect(boot.identity.lockedCounterpartyId).toBe(horizonRole.partyId);
    expect(boot.identity.partyIndex).toBe(horizonRole.partyIndex);
    expect(boot.identity.recipientName).toBe(TEST440_HORIZON);

    const scoped = boot.fields.filter((f) =>
      recipientFieldBelongsToLockedSigner(
        f,
        boot.identity.lockedCounterpartyId,
        boot.identity.lockedSignerRoleId,
      ),
    );
    for (const sig of scoped.filter((f) => f.type === "signature")) {
      sig.value = TEST461_SIGNER_METADATA.partySignerNames[2]!;
    }

    const postBody = vi.fn();
    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockImplementation(
      async (_aid, body) => {
        postBody(body);
        return { ok: true, fully_executed: false, completion_emails_sent: false };
      },
    );

    const before = readLocalSigningProgressSnapshot(TEST463_AG);
    expect(before?.signedCount ?? 0).toBe(0);
    expect(before?.requiredCount).toBe(4);

    const result = await recordVs01SignerCompletion({
      agreementId: TEST463_AG,
      documentId: TEST463_DOC,
      signerRoleId: boot.identity.lockedSignerRoleId,
      participantId: boot.identity.lockedCounterpartyId,
      partyIndex: boot.identity.partyIndex,
      displayName: TEST461_SIGNER_METADATA.partySignerNames[2],
      recipientFields: scoped,
    });

    expect(result.serverSynced).toBe(true);
    expect(postBody).toHaveBeenCalled();
    const body = postBody.mock.calls[0]![0] as {
      signer_role_id: string;
      participant_id: string;
    };
    expect(body.signer_role_id).toBe(horizonRole.roleId);
    expect(body.participant_id).toBe(horizonRole.partyId);

    const snap = readSigningPacketStatus(TEST463_AG)!;
    expect(snap.bySignerKey[horizonRole.roleId]).toBe("signed");
    expect(snap.bySignerKey[brightPeakRole.roleId]).toBe("waiting");
    expect(snap.bySignerKey[evergreenRole.roleId]).toBe("waiting");
    expect(snap.bySignerKey[atlasRole.roleId]).toBe("waiting");

    const progress = readLocalSigningProgressSnapshot(TEST463_AG)!;
    expect(progress.signedCount).toBe(1);
    expect(progress.requiredCount).toBe(4);
    expect(progress.partiallySigned).toBe(true);
    expect(countSignedSigners(snap.bySignerKey, Object.keys(snap.bySignerKey))).toEqual({
      signed: 1,
      total: 4,
    });
  });
});
