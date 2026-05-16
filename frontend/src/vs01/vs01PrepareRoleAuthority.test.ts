/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { getVs01DefaultFieldGeometry } from "./signingFields";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty } from "./types";
import {
  buildPrepareAutoInitialsEveryPage,
  createPrepareStampedSenderField,
  PREPARE_FIELD_ASSIGNMENT_SOURCE,
} from "./vs01PrepareFieldPlacement";
import { createVs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import { buildVs01PrepareSigningRoles, stampSenderFieldWithPrepareRole } from "./vs01SignerFieldAssignment";

const AG = "agreement_role_authority";

describe("Vs01PrepareRoleAuthority", () => {
  it("stale closure regression: ref role wins over lagging visual id", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(roles[0]!.roleId, "init");
    authority.setActiveRole(roles.find((r) => r.vs01CounterpartyId === "c1")!.roleId, "user_select");

    const resolved = authority.resolveRoleForPlacement({
      tool: "signature",
      page: 0,
      visualRoleId: roles[0]!.roleId,
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reason).toBe("role_authority_mismatch");

    const ok = authority.resolveRoleForPlacement({
      tool: "signature",
      page: 0,
      visualRoleId: authority.getActiveRoleId(),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.role.partyId).toBe("c1");
  });

  it("owner complete auto-advances to first counterparty", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const owner = roles[0]!;
    const cp = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(owner.roleId, "init");
    const base: PlacedSigningField = {
      id: "b",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
    };
    const sender = [
      stampSenderFieldWithPrepareRole(base, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "pn", type: "printed_name" }, owner),
      stampSenderFieldWithPrepareRole({ ...base, id: "dt", type: "date", value: "2026-01-01" }, owner),
    ];
    authority.afterPlacement(sender, []);
    expect(authority.getActiveRoleId()).toBe(cp.roleId);
  });

  it("next signer cycles to next incomplete role", () => {
    const cps: Vs01Counterparty[] = [
      { id: "c1", name: "A LLC", email: "a@x.com" },
      { id: "c2", name: "B LLC", email: "b@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(roles[0]!.roleId, "init");
    const next = authority.advanceToNextIncompleteRole([], [], "next_signer");
    expect(next?.vs01CounterpartyId).toBe("c1");
  });
});

describe("createPrepareStampedSenderField", () => {
  it("stamps counterparty signature when authority is counterparty", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(cp.roleId, "user_select");
    const field = createPrepareStampedSenderField({
      authority,
      type: "signature",
      page: 0,
      clickX: 0.2,
      clickY: 0.2,
      valueCtx: { typedName: "X", initials: "X" },
      visualRoleId: authority.getActiveRoleId(),
    });
    expect(field).not.toBeNull();
    expect(field!.assignedPartyId).toBe("c1");
    expect(field!.assignedSignerRoleKind).toBe("counterparty");
    expect(field!.assignmentSource).toBe(PREPARE_FIELD_ASSIGNMENT_SOURCE);
  });
});

describe("buildPrepareAutoInitialsEveryPage", () => {
  it("stamps initials for active counterparty role only", () => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles.find((r) => r.vs01CounterpartyId === "c1")!;
    const auto = buildPrepareAutoInitialsEveryPage({
      role: cp,
      pageCount: 3,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "A", initials: "A" },
    });
    expect(auto.length).toBe(3);
    for (const f of auto) {
      expect(f.assignedSignerRoleId).toBe(cp.roleId);
      expect(f.assignedPartyId).toBe("c1");
    }
  });
});

describe("geometry", () => {
  it("initials default matches prepare spec", () => {
    const g = getVs01DefaultFieldGeometry("initials");
    expect(g.width).toBe(0.1);
    expect(g.height).toBe(0.045);
  });
});
