/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST461_SIGNER_METADATA } from "../components/agreements/paidProTest461Vs01PreparePacketFixtures";
import {
  buildTest463FourPartyPreparePacket,
  test463RoleByEntity,
  TEST463_AG,
  TEST463_DOC,
} from "./paidProTest463Fixtures";
import { bootstrapVs01RecipientSigningAuthority } from "./vs01RecipientAuthorityBootstrap";
import { recipientFieldBelongsToLockedSigner } from "./vs01SignerFieldAssignment";
import {
  countRecipientSigningActions,
  recipientFinishGateEditableFields,
} from "./recipientSigningFieldUtils";
import {
  normalizeVs01PortableInitialsPolicy,
  resolveRecipientInitialsEnabled,
} from "./vs01RecipientSignerMarksHydration";
import { computeVs01PacketRevision } from "./vs01CanonicalPacketSeed";
import * as recipientAccessApi from "../agreement/recipientAccessApi";
import * as vs01SigningPacketServer from "./vs01SigningPacketServer";

const RECIPIENTS = [
  {
    entity: TEST440_EVERGREEN,
    name: TEST461_SIGNER_METADATA.partySignerNames[0]!,
    email: TEST461_SIGNER_METADATA.recipient1Email,
    partyIndex: 0,
  },
  {
    entity: TEST440_ATLAS,
    name: TEST461_SIGNER_METADATA.partySignerNames[1]!,
    email: TEST461_SIGNER_METADATA.recipient2Email,
    partyIndex: 1,
  },
  {
    entity: TEST440_HORIZON,
    name: TEST461_SIGNER_METADATA.partySignerNames[2]!,
    email: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0]!,
    partyIndex: 2,
  },
  {
    entity: TEST440_BRIGHT_PEAK,
    name: TEST461_SIGNER_METADATA.partySignerNames[3]!,
    email: TEST461_SIGNER_METADATA.extraPartyReviewEmails[1]!,
    partyIndex: 3,
  },
] as const;

function staleSignatureOnlyRevision(portable: ReturnType<typeof buildTest463FourPartyPreparePacket>["portable"]): string {
  return computeVs01PacketRevision({
    corpusHash: portable.seed.corpusHash,
    initialsEnabled: false,
    fieldCount: portable.fieldCount,
  });
}

async function bootstrapRecipient(
  portable: ReturnType<typeof buildTest463FourPartyPreparePacket>["portable"],
  roles: ReturnType<typeof buildTest463FourPartyPreparePacket>["roles"],
  entityName: string,
  packetRevision?: string | null,
) {
  const role = test463RoleByEntity(entityName, roles);
  vi.spyOn(recipientAccessApi, "validateRecipientAccessToken").mockResolvedValue({
    ok: true,
    data: {
      ok: true,
      agreement_id: TEST463_AG,
      mode: "sign",
      locked_version_id: "v1",
      recipient_party_id: role.partyId,
    },
  });
  vi.spyOn(vs01SigningPacketServer, "fetchPublicVs01SigningPacket").mockResolvedValue({
    ok: true,
    portable,
  });
  const recipient = RECIPIENTS.find((r) => r.entity === entityName)!;
  return bootstrapVs01RecipientSigningAuthority({
    agreementId: TEST463_AG,
    documentId: TEST463_DOC,
    packetRevision: packetRevision ?? null,
    recipientAccessToken: `tok_${entityName}`,
    urlSignerRoleId: role.roleId,
    urlCounterpartyId: role.partyId,
    urlRecipientIndex: role.partyIndex,
    urlRecipientName: recipient.entity,
    urlRecipientEmail: recipient.email,
  });
}

function assertRecipientInitials(
  boot: Awaited<ReturnType<typeof bootstrapRecipient>>,
  entityName: string,
) {
  expect(boot.ok).toBe(true);
  if (!boot.ok) return;
  const recipient = RECIPIENTS.find((r) => r.entity === entityName)!;
  expect(boot.identity.recipientName).toBe(recipient.entity);
  expect(boot.initialsEnabled).toBe(true);

  const scoped = boot.fields.filter((f) =>
    recipientFieldBelongsToLockedSigner(
      f,
      boot.identity.lockedCounterpartyId,
      boot.identity.lockedSignerRoleId,
    ),
  );
  expect(scoped.some((f) => f.type === "signature")).toBe(true);
  const editable = recipientFinishGateEditableFields(scoped, { initialsEnabled: true });
  expect(countRecipientSigningActions(editable, { initialsEnabled: true })).toBeGreaterThan(1);
  expect(editable.some((f) => f.type === "initials")).toBe(true);
  expect(editable.filter((f) => f.type === "signature")).toHaveLength(1);
}

describe("TEST473 — first opened recipient receives initials", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("BrightPeak/Benton first-open with stale URL revision still receives initials from server packet", async () => {
    const { portable, roles } = buildTest463FourPartyPreparePacket();
    const staleRev = staleSignatureOnlyRevision(portable);
    const boot = await bootstrapRecipient(portable, roles, TEST440_BRIGHT_PEAK, staleRev);
    assertRecipientInitials(boot, TEST440_BRIGHT_PEAK);
  });

  it("Atlas/Ann receives the same initials action pattern", async () => {
    const { portable, roles } = buildTest463FourPartyPreparePacket();
    const boot = await bootstrapRecipient(portable, roles, TEST440_ATLAS);
    assertRecipientInitials(boot, TEST440_ATLAS);
  });
});

describe("TEST474 — all four recipients receive initials independently", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  for (const recipient of RECIPIENTS) {
    it(`${recipient.entity} first-open in clean storage receives signature + initials`, async () => {
      localStorage.clear();
      sessionStorage.clear();
      const { portable, roles } = buildTest463FourPartyPreparePacket();
      const staleRev = staleSignatureOnlyRevision(portable);
      const boot = await bootstrapRecipient(portable, roles, recipient.entity, staleRev);
      assertRecipientInitials(boot, recipient.entity);
    });
  }
});

describe("TEST475 — async bootstrap cannot freeze signature-only action count", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("authoritative server portable keeps initials when URL revision suffix says disabled", () => {
    const { portable } = buildTest463FourPartyPreparePacket();
    const staleRev = staleSignatureOnlyRevision(portable);
    const normalized = normalizeVs01PortableInitialsPolicy(portable, { packetRevision: staleRev });
    expect(normalized.initialsPolicy.enabled).toBe(true);
    expect(normalized.fields.some((f) => f.type === "initials")).toBe(true);
    expect(
      resolveRecipientInitialsEnabled({ portable: normalized, packetRevision: staleRev }),
    ).toBe(true);
  });

  it("bootstrap resolves initialsEnabled true before action count should finalize", async () => {
    const { portable, roles } = buildTest463FourPartyPreparePacket();
    const staleRev = staleSignatureOnlyRevision(portable);
    const boot = await bootstrapRecipient(portable, roles, TEST440_BRIGHT_PEAK, staleRev);
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(boot.initialsEnabled).toBe(true);
    const editable = recipientFinishGateEditableFields(
      boot.fields.filter((f) =>
        recipientFieldBelongsToLockedSigner(
          f,
          boot.identity.lockedCounterpartyId,
          boot.identity.lockedSignerRoleId,
        ),
      ),
      { initialsEnabled: boot.initialsEnabled },
    );
    expect(countRecipientSigningActions(editable, { initialsEnabled: boot.initialsEnabled })).toBeGreaterThan(1);
  });
});
