/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as vs01SigningPacketServer from "./vs01SigningPacketServer";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { bootstrapVs01RecipientSigningAuthority } from "./vs01RecipientAuthorityBootstrap";
import {
  buildTest463FourPartyPreparePacket,
  TEST463_AG,
  TEST463_DOC,
  test463RoleByEntity,
} from "./paidProTest463Fixtures";
import { recipientFieldBelongsToLockedSigner } from "./vs01SignerFieldAssignment";
import { storeVs01CanonicalPacketPortable } from "./vs01CanonicalPacketSeed";
import {
  ensureSigningPacketStatusFromHandoff,
  readSigningPacketStatus,
} from "./vs01SigningPacketStatusStore";
import {
  recordVs01SignerCompletion,
  resetVs01SignerCompletionInFlightForTests,
} from "./vs01SignerCompletionSync";
import { readLocalSigningProgressSnapshot } from "./vs01WorkspaceSigningStatus";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

async function bootstrapParty(args: {
  role: Vs01PrepareSigningRole;
  portable: ReturnType<typeof buildTest463FourPartyPreparePacket>["portable"];
  token: string;
}) {
  vi.spyOn(recipientAccessApi, "validateRecipientAccessToken").mockResolvedValue({
    ok: true,
    data: {
      ok: true,
      agreement_id: TEST463_AG,
      mode: "sign",
      locked_version_id: "v1",
      recipient_party_id: args.role.partyId,
    },
  });
  vi.spyOn(vs01SigningPacketServer, "fetchPublicVs01SigningPacket").mockResolvedValue({
    ok: true,
    portable: args.portable,
  });
  return bootstrapVs01RecipientSigningAuthority({
    agreementId: TEST463_AG,
    documentId: TEST463_DOC,
    recipientAccessToken: args.token,
    urlSignerRoleId: args.role.roleId,
    urlCounterpartyId: args.role.partyId,
    urlRecipientIndex: args.role.partyIndex,
    urlRecipientName: args.role.entityName,
    urlRecipientEmail: (args.role.signerEmail ?? "").trim(),
  });
}

describe("TEST465 — four-party recipient isolation and ordered dashboard progress", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    resetVs01SignerCompletionInFlightForTests();
  });

  it("each recipient sees only their entity fields; dashboard advances 0→4 in random order", async () => {
    const { roles, portable, handoff } = buildTest463FourPartyPreparePacket();
    storeVs01CanonicalPacketPortable(TEST463_DOC, portable);
    ensureSigningPacketStatusFromHandoff(handoff, roles[0]!.roleId);

    const partyEntities = [TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK, TEST440_EVERGREEN];
    const bootResults = [];
    for (let i = 0; i < partyEntities.length; i++) {
      const entity = partyEntities[i]!;
      bootResults.push(
        await bootstrapParty({
          role: test463RoleByEntity(entity, roles),
          portable,
          token: `tok_${i}`,
        }),
      );
    }
    for (const boot of bootResults) {
      expect(boot.ok).toBe(true);
    }

    for (let i = 0; i < bootResults.length; i++) {
      const boot = bootResults[i]!;
      if (!boot.ok) continue;
      const selfRole = test463RoleByEntity(partyEntities[i]!, roles);
      for (let j = 0; j < bootResults.length; j++) {
        if (i === j) continue;
        const otherRole = test463RoleByEntity(partyEntities[j]!, roles);
        const otherScoped = boot.fields.filter((f) =>
          recipientFieldBelongsToLockedSigner(f, otherRole.partyId, otherRole.roleId),
        );
        expect(otherScoped.length).toBe(0);
      }
      const selfScoped = boot.fields.filter((f) =>
        recipientFieldBelongsToLockedSigner(
          f,
          boot.identity.lockedCounterpartyId,
          boot.identity.lockedSignerRoleId,
        ),
      );
      expect(selfScoped.some((f) => f.type === "signature")).toBe(true);
      expect(boot.identity.recipientName).toBe(selfRole.entityName);
      expect(boot.identity.lockedSignerRoleId).toBe(selfRole.roleId);
    }

    vi.spyOn(agreementWorkspaceApi, "postVs01SignerComplete").mockResolvedValue({
      ok: true,
      fully_executed: false,
      completion_emails_sent: false,
    });

    const completionOrder = [
      test463RoleByEntity(TEST440_HORIZON, roles),
      test463RoleByEntity(TEST440_EVERGREEN, roles),
      test463RoleByEntity(TEST440_BRIGHT_PEAK, roles),
      test463RoleByEntity(TEST440_ATLAS, roles),
    ];

    for (let step = 0; step < completionOrder.length; step++) {
      const role = completionOrder[step]!;
      const boot = bootResults.find(
        (b) => b.ok && b.identity.lockedSignerRoleId === role.roleId,
      );
      expect(boot?.ok).toBe(true);
      if (!boot?.ok) continue;

      const scoped = boot.fields
        .filter((f) =>
          recipientFieldBelongsToLockedSigner(
            f,
            boot.identity.lockedCounterpartyId,
            boot.identity.lockedSignerRoleId,
          ),
        )
        .map((f) =>
          f.type === "signature"
            ? { ...f, value: role.signerName ?? "Signed" }
            : f,
        );

      await recordVs01SignerCompletion({
        agreementId: TEST463_AG,
        documentId: TEST463_DOC,
        signerRoleId: boot.identity.lockedSignerRoleId,
        participantId: boot.identity.lockedCounterpartyId,
        partyIndex: boot.identity.partyIndex,
        displayName: role.signerName,
        recipientFields: scoped,
      });

      const progress = readLocalSigningProgressSnapshot(TEST463_AG)!;
      expect(progress.signedCount).toBe(step + 1);
      expect(progress.requiredCount).toBe(4);
      expect(progress.fullySigned).toBe(step + 1 === 4);
    }

    const snap = readSigningPacketStatus(TEST463_AG)!;
    for (const role of roles) {
      expect(snap.bySignerKey[role.roleId]).toBe("signed");
    }
  });
});
