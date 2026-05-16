/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { Vs01Counterparty } from "./types";
import { createVs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import {
  buildVs01PrepareSigningRoles,
  findPrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import { createPrepareStampedSenderField } from "./vs01PrepareFieldPlacement";
import {
  buildPrepareTemplateValueContext,
  defaultPrepareTemplateStoredValue,
  prepareTemplateDisplayForField,
} from "./vs01PrepareTemplateField";

const AG = "agreement_template_field";

describe("prepare template values", () => {
  it("counterparty placement stores empty values, not owner fallback", () => {
    const cps: Vs01Counterparty[] = [
      { id: "atlas", name: "Atlas Harbor Technologies Inc.", email: "a@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Redwood LLC",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles.find((r) => r.vs01CounterpartyId === "atlas")!;
    const ctx = buildPrepareTemplateValueContext(cp, {
      typedName: "Redwood Signer",
      initials: "RS",
    });
    expect(ctx.typedName).toBe("");
    expect(ctx.initials).toBe("");
    expect(defaultPrepareTemplateStoredValue("signature", cp, ctx)).toBe("");
    expect(defaultPrepareTemplateStoredValue("email", cp, ctx)).toBe("a@x.com");
    expect(defaultPrepareTemplateStoredValue("date", cp, ctx)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("counterparty signature render uses entity placeholder, not owner name", () => {
    const cps: Vs01Counterparty[] = [
      { id: "atlas", name: "Atlas Harbor Technologies Inc.", email: "a@x.com" },
    ];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Redwood LLC",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = roles.find((r) => r.vs01CounterpartyId === "atlas")!;
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(cp.roleId, "user_select");
    const placed = createPrepareStampedSenderField({
      authority,
      type: "signature",
      page: 0,
      clickX: 0.2,
      clickY: 0.2,
      valueCtx: { typedName: "Redwood Signer", initials: "RS" },
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const display = prepareTemplateDisplayForField(placed.field, cp);
    expect(display.isPlaceholder).toBe(true);
    expect(display.body).toBe("Signer signs here");
    expect(display.assigneeLine).toContain("Atlas");
  });
});

describe("prepare placement tools", () => {
  const tools = ["signature", "initials", "printed_name", "text", "email", "date"] as const;

  it.each(tools)("places %s for active counterparty role", (tool) => {
    const cps: Vs01Counterparty[] = [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }];
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const cp = findPrepareSigningRole(roles, roles[1]!.roleId)!;
    const authority = createVs01PrepareRoleAuthority();
    authority.setRoles(roles);
    authority.setActiveRole(cp.roleId, "user_select");
    const placed = createPrepareStampedSenderField({
      authority,
      type: tool,
      page: 0,
      clickX: 0.25,
      clickY: 0.25,
      valueCtx: { typedName: "Owner Name", initials: "ON" },
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.field.assignedSignerRoleId).toBe(cp.roleId);
    expect(placed.field.assignedPartyId).toBe("c1");
    if (tool === "signature" || tool === "initials" || tool === "text") {
      expect(String(placed.field.value ?? "")).toBe("");
    }
    if (tool === "email") {
      expect(String(placed.field.value ?? "")).toBe("a@x.com");
    }
    if (tool === "date") {
      expect(String(placed.field.value ?? "")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
