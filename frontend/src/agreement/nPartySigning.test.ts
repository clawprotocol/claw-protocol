import { describe, expect, it } from "vitest";
import {
  countRequiredSignersFromHandoff,
  countRequiredSignersFromPortableRoles,
  resolveRequiredSignerCount,
} from "./resolveRequiredSignerCount";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import {
  buildVs01PrepareSigningRoles,
  buildVs01PrepareSigningRolesFromLegalParties,
} from "../vs01/vs01SignerFieldAssignment";

describe("resolveRequiredSignerCount", () => {
  it("uses signer_party_count without flooring at 2", () => {
    expect(resolveRequiredSignerCount({ signerPartyCount: 3 })).toBe(3);
    expect(resolveRequiredSignerCount({ signerPartyCount: 1 })).toBe(1);
  });

  it("defaults to 2 only when no signals exist (legacy empty state)", () => {
    expect(resolveRequiredSignerCount({})).toBe(2);
  });

  it("prefers explicit public verify count over party_count", () => {
    expect(
      resolveRequiredSignerCount({ signerPartyCount: 4, partyCount: 2, signerCount: 2 }),
    ).toBe(4);
  });
});

describe("countRequiredSignersFromHandoff", () => {
  it("counts owner role plus signer rows for three-party handoff", () => {
    const handoff: PaidProVs01PostSignHandoffV1 = {
      v: 1,
      agreementId: "ag-3",
      agreementTitle: "Three-party",
      vs01DocumentId: "doc",
      receiptId: "",
      receiptHashSha256: null,
      savedAt: "2026-06-01T00:00:00Z",
      packetPrepareOnly: true,
      ownerSignerRoleId: "role_a",
      ownerSigningUrl: "",
      signers: [
        { counterpartyId: "p2", displayName: "Beta", email: "b@t.com", signingUrl: "", signerRoleId: "role_b" },
        { counterpartyId: "p3", displayName: "Gamma", email: "c@t.com", signingUrl: "", signerRoleId: "role_c" },
      ],
    };
    expect(countRequiredSignersFromHandoff(handoff)).toBe(3);
  });
});

describe("buildVs01PrepareSigningRolesFromLegalParties", () => {
  it("builds three signer roles for three legal parties", () => {
    const roles = buildVs01PrepareSigningRolesFromLegalParties({
      agreementId: "ag-triple",
      parties: [
        { id: "p1", name: "Alpha LLC", role: "owner" },
        { id: "p2", name: "Beta Inc", role: "party" },
        { id: "p3", name: "Gamma Corp", role: "party" },
      ],
    });
    expect(roles).toHaveLength(3);
    expect(roles.map((r) => r.requiresSignature)).toEqual([true, true, true]);
  });

  it("excludes coordinator from signing roles when creator is not a party", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag-coord",
      creatorName: "Admin User",
      creatorEmail: "admin@example.test",
      counterparties: [],
      creatorIsParty: false,
      legalParties: [
        { id: "p1", name: "Alpha LLC", role: "party", email: "a@t.com" },
        { id: "p2", name: "Beta Inc", role: "party", email: "b@t.com" },
        { id: "coord", name: "Coordinator", role: "coordinator", email: "admin@t.com" },
      ],
    });
    expect(roles).toHaveLength(2);
    expect(roles.every((r) => r.entityName !== "Coordinator")).toBe(true);
  });

  it("preserves two-party owner + counterparty shape by default", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag-2",
      creatorName: "Owner LLC",
      creatorEmail: "owner@t.com",
      counterparties: [{ id: "cp1", name: "Counterparty LLC", email: "cp@t.com" }],
    });
    expect(roles).toHaveLength(2);
    expect(roles[0]?.kind).toBe("owner");
    expect(roles[1]?.kind).toBe("counterparty");
  });
});

describe("countRequiredSignersFromPortableRoles", () => {
  it("counts only roles that require signature", () => {
    expect(
      countRequiredSignersFromPortableRoles([
        { requiresSignature: true },
        { requiresSignature: true },
        { requiresSignature: false },
      ]),
    ).toBe(2);
  });
});
