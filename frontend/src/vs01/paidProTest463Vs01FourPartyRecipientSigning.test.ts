/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST440_BRIGHT_PEAK,
  TEST440_HORIZON,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST461_SIGNER_METADATA } from "../components/agreements/paidProTest461Vs01PreparePacketFixtures";
import {
  buildTest463FourPartyPreparePacket,
  test463RoleByEntity,
} from "./paidProTest463Fixtures";
import {
  findPortableRoleForPartyId,
  resolveVs01RecipientIdentityFromAuthority,
} from "./vs01RecipientIdentityAuthority";
import { bootstrapVs01RecipientSigningAuthority } from "./vs01RecipientAuthorityBootstrap";
import { recipientFieldBelongsToLockedSigner } from "./vs01SignerFieldAssignment";
import {
  countRecipientSigningActions,
  recipientFinishGateEditableFields,
} from "./recipientSigningFieldUtils";
import { resolveRecipientInitialsEnabled } from "./vs01RecipientSignerMarksHydration";
import { resolveRecipientCanonicalSigningPacket } from "./resolveRecipientCanonicalSigningPacket";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as vs01SigningPacketServer from "./vs01SigningPacketServer";
import { TEST463_AG, TEST463_DOC } from "./paidProTest463Fixtures";

describe("TEST463 — four-party recipient signing identity", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("maps Horizon token party id to Horizon role, not BrightPeak", () => {
    const { roles, portable } = buildTest463FourPartyPreparePacket();
    const horizonRole = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    const identity = resolveVs01RecipientIdentityFromAuthority({
      portable,
      tokenPartyId: horizonRole.partyId,
      urlSignerRoleId: horizonRole.roleId,
      urlCounterpartyId: horizonRole.partyId,
      urlRecipientIndex: horizonRole.partyIndex,
      urlRecipientName: TEST440_HORIZON,
      urlRecipientEmail: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0]!,
    });
    expect("blocked" in identity).toBe(false);
    if ("blocked" in identity) return;
    expect(identity.lockedSignerRoleId).toBe(horizonRole.roleId);
    expect(identity.recipientName).toBe(TEST440_HORIZON);
    expect(identity.lockedSignerRoleId).not.toBe(brightPeakRole.roleId);
    expect(findPortableRoleForPartyId(portable, horizonRole.partyId)?.signerName).toBe(
      TEST461_SIGNER_METADATA.partySignerNames[2],
    );
  });

  it("blocks when URL signer_role_id disagrees with token-bound Horizon party", () => {
    const { roles, portable } = buildTest463FourPartyPreparePacket();
    const horizonRole = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    const blocked = resolveVs01RecipientIdentityFromAuthority({
      portable,
      tokenPartyId: horizonRole.partyId,
      urlSignerRoleId: brightPeakRole.roleId,
      urlCounterpartyId: horizonRole.partyId,
      urlRecipientIndex: 3,
      urlRecipientName: TEST440_HORIZON,
      urlRecipientEmail: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0]!,
    });
    expect("blocked" in blocked).toBe(true);
    if (!("blocked" in blocked)) return;
    expect(blocked.code).toBe("url_signer_role_token_mismatch");
  });

  it("Horizon link scopes actionable fields to Horizon only with initials enabled", async () => {
    const { roles, portable } = buildTest463FourPartyPreparePacket();
    const horizonRole = test463RoleByEntity(TEST440_HORIZON, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

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

    expect(boot.signerCount).toBe(4);
    expect(boot.identity.lockedSignerRoleId).toBe(horizonRole.roleId);
    expect(boot.initialsEnabled).toBe(true);

    const scoped = boot.fields.filter((f) =>
      recipientFieldBelongsToLockedSigner(
        f,
        boot.identity.lockedCounterpartyId,
        boot.identity.lockedSignerRoleId,
      ),
    );
    const brightPeakScoped = boot.fields.filter((f) =>
      recipientFieldBelongsToLockedSigner(f, brightPeakRole.partyId, brightPeakRole.roleId),
    );
    expect(brightPeakScoped.length).toBe(0);
    expect(scoped.some((f) => f.type === "signature")).toBe(true);
    const editable = recipientFinishGateEditableFields(scoped, { initialsEnabled: true });
    expect(countRecipientSigningActions(editable, { initialsEnabled: true })).toBeGreaterThan(1);
    expect(editable.every((f) => f.assignedSignerRoleId === horizonRole.roleId)).toBe(true);
  });

  it("canonical recipient packet uses four signer roles for signer-count authority", () => {
    const { roles, portable } = buildTest463FourPartyPreparePacket();
    const initialsEnabled = resolveRecipientInitialsEnabled({ portable });
    expect(initialsEnabled).toBe(true);

    const canonical = resolveRecipientCanonicalSigningPacket({
      documentId: TEST463_DOC,
      agreementId: TEST463_AG,
      roles,
      initialsEnabled,
      portablePacket: portable,
    });
    expect(canonical).not.toBeNull();
    expect(canonical!.model.fields.filter((f) => f.type === "initials").length).toBeGreaterThan(0);
    expect(portable.roles.length).toBe(4);
  });

  it("invite targets carry distinct signer_role_id per party", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const horizonSigner = handoff.signers.find((s) => s.displayName === TEST440_HORIZON);
    const brightPeakSigner = handoff.signers.find((s) => s.displayName === TEST440_BRIGHT_PEAK);
    expect(horizonSigner?.signerRoleId).toContain(":i2:");
    expect(brightPeakSigner?.signerRoleId).toContain(":i3:");
    expect(horizonSigner?.signingUrl).toContain("signer_role_id=");
    const horizonParams = new URL(horizonSigner!.signingUrl).searchParams;
    expect(horizonParams.get("signer_role_id")).toBe(horizonSigner!.signerRoleId);
    expect(horizonParams.get("recipient_index")).toBe(
      String(roles.find((r) => r.entityName === TEST440_HORIZON)!.partyIndex),
    );
  });
});
