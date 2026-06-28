/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { buildStableSignerRoleId } from "./vs01SignerFieldAssignment";
import { resolveVs01RecipientIdentityFromAuthority } from "./vs01RecipientIdentityAuthority";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";

function minimalPortable(roles: Array<{ partyIndex: number; partyId: string; name: string }>): Vs01CanonicalPacketPortableV1 {
  const portableRoles = roles.map((r) => ({
    roleId: buildStableSignerRoleId("ag_id_test", r.partyIndex, r.partyId),
    partyIndex: r.partyIndex,
    partyId: r.partyId,
    entityName: r.name,
    partyName: r.name,
    roleLabel: r.name,
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: r.partyId,
    kind: r.partyIndex === 0 ? ("owner" as const) : ("counterparty" as const),
  }));
  return {
    v: 1,
    seed: {
      v: 1,
      documentId: "doc",
      agreementId: "ag_id_test",
      corpusPlain: "x".repeat(2000),
      corpusHash: "hash_test",
      savedAt: "2026-01-01T00:00:00Z",
    },
    fields: portableRoles.map((r) => ({
      id: `sig_${r.roleId}`,
      counterpartyId: r.partyId,
      type: "signature" as const,
      page: 1,
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.05,
      assignedSignerRoleId: r.roleId,
    })),
    roles: portableRoles,
    pageCount: 2,
    witnessPageIndex: 1,
    initialsPolicy: { enabled: true, bodyPagesOnly: true },
    fieldCount: portableRoles.length,
  };
}

describe("vs01RecipientIdentityAuthority", () => {
  it("token party id wins over wrong signer_role_id when blocking mismatch", () => {
    const portable = minimalPortable([
      { partyIndex: 0, partyId: "p0", name: "BrightPeak Retail Solutions LLC" },
      { partyIndex: 3, partyId: "p3", name: "Horizon Wholesale Group LLC" },
    ]);
    const blocked = resolveVs01RecipientIdentityFromAuthority({
      portable,
      tokenPartyId: "p3",
      urlSignerRoleId: portable.roles.find((r) => r.partyId === "p0")!.roleId,
      urlCounterpartyId: "p3",
      urlRecipientIndex: 3,
      urlRecipientName: "Horizon Wholesale Group LLC",
      urlRecipientEmail: "h@example.com",
    });
    expect("blocked" in blocked).toBe(true);
  });

  it("resolves from token when URL omits signer_role_id", () => {
    const portable = minimalPortable([
      { partyIndex: 0, partyId: "p0", name: "Alpha" },
      { partyIndex: 3, partyId: "p3", name: "Horizon Wholesale Group LLC" },
    ]);
    const horizonRole = portable.roles.find((r) => r.partyId === "p3")!;

    const identity = resolveVs01RecipientIdentityFromAuthority({
      portable,
      tokenPartyId: "p3",
      urlSignerRoleId: null,
      urlCounterpartyId: "p3",
      urlRecipientIndex: 3,
      urlRecipientName: "Horizon Wholesale Group LLC",
      urlRecipientEmail: "h@example.com",
    });
    expect("blocked" in identity).toBe(false);
    if ("blocked" in identity) return;
    expect(identity.lockedSignerRoleId).toBe(horizonRole.roleId);
    expect(identity.source).toBe("token_packet");
  });
});
