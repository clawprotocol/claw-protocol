import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import {
  buildVs01PrepareSigningRoles,
  canFinishPreparePacketSignerCentric,
  evaluatePreparePacketGateFromRoles,
  stampSenderFieldWithPrepareRole,
} from "./vs01SignerFieldAssignment";
import {
  missingHardKeysForRole,
  optionalSuggestedKeysForRole,
  resolveVs01RequiredSignerFields,
  VS01_DEFAULT_REQUIRED_KEYS,
} from "./vs01RequiredSignerFields";
import {
  PREPARE_BLOCKED_PANEL_TITLE,
  PREPARE_PACKET_READY_COPY,
} from "./vs01PreparePacketCompletion";

const FIVE_PARTY_NAMES = [
  "Redwood Peak Ventures LLC",
  "Atlas Harbor Technologies Inc.",
  "Meridian Workforce Group LLC",
  "Prairie Signal Holdings LP",
  "NovaGrid Systems LLC",
] as const;

const AG = "agreement_vs01_required_fields_qa";

function cpsFromNames(names: readonly string[]): Vs01Counterparty[] {
  return names.map((name, i) => ({ id: `p${i}`, name, email: `${i}@x.com` }));
}

function signatureOnlyForRoles(
  roles: ReturnType<typeof buildVs01PrepareSigningRoles>,
): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: "sig",
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.05,
  };
  return roles.map((role, i) =>
    stampSenderFieldWithPrepareRole({ ...base, id: `sig-${i}` }, role),
  );
}

describe("resolveVs01RequiredSignerFields", () => {
  it("defaults requiredKeys to signature only", () => {
    const resolved = resolveVs01RequiredSignerFields({
      roles: [{ roleId: "r1", requiresSignature: true, entityName: "Acme LLC" }],
      fieldsByRole: { r1: { signature: 0, printed_name: 0, date: 0, title: 0 } },
    });
    expect(resolved.requiredKeys).toEqual([...VS01_DEFAULT_REQUIRED_KEYS]);
    expect(resolved.canContinue).toBe(false);
    expect(resolved.missingSignatureRoles).toHaveLength(1);
  });

  it("optionalSuggestedFieldsByRole lists missing optional fields without blocking", () => {
    const resolved = resolveVs01RequiredSignerFields({
      roles: [{ roleId: "r1", requiresSignature: true, entityName: "Acme LLC" }],
      fieldsByRole: { r1: { signature: 1, printed_name: 0, date: 0, title: 0 } },
    });
    expect(resolved.canContinue).toBe(true);
    expect(resolved.optionalSuggestedFieldsByRole.r1).toEqual(["printed_name", "title", "date"]);
  });

  it("honors explicit template-required keys only when provided", () => {
    const miss = missingHardKeysForRole(
      { signature: 1, printed_name: 0, date: 0, title: 0 },
      ["title"],
    );
    expect(miss).toEqual(["title"]);
    expect(optionalSuggestedKeysForRole({ signature: 1, printed_name: 0, date: 1, title: 0 })).toContain(
      "printed_name",
    );
  });
});

describe("five-party SaaS reseller prepare gate", () => {
  const cps = cpsFromNames(FIVE_PARTY_NAMES.slice(1));

  function rolesAndGate(sender: PlacedSigningField[], recipient: Vs01RecipientPlacedField[] = []) {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const gate = canFinishPreparePacketSignerCentric({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: recipient,
    });
    return { roles, gate };
  }

  it("1. five roles, no fields → cannot continue, five missing signatures", () => {
    const { gate } = rolesAndGate([]);
    expect(gate.canFinish).toBe(false);
    expect(gate.missingSignatureRoles).toHaveLength(5);
    expect(gate.requiredKeys).toEqual(["signature"]);
  });

  it("2. five roles, signatures only → can continue", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const sender = signatureOnlyForRoles(roles);
    const gate = canFinishPreparePacketSignerCentric({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(gate.canFinish).toBe(true);
    expect(gate.missingSignatureRoles).toHaveLength(0);
  });

  it("3. five roles, signatures plus optional fields → can continue", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const base: PlacedSigningField = {
      id: "b",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.05,
    };
    const sender: PlacedSigningField[] = [];
    for (const role of roles) {
      sender.push(stampSenderFieldWithPrepareRole(base, role));
      sender.push(
        stampSenderFieldWithPrepareRole({ ...base, id: `${role.roleId}-pn`, type: "printed_name" }, role),
      );
      sender.push(
        stampSenderFieldWithPrepareRole(
          { ...base, id: `${role.roleId}-dt`, type: "date", value: "2026-05-01" },
          role,
        ),
      );
    }
    const gate = canFinishPreparePacketSignerCentric({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
      senderPlacedFields: sender,
      recipientPlacedFields: [],
    });
    expect(gate.canFinish).toBe(true);
  });

  it("4. remove printed_name/title/date from one role → still can continue if signature remains", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const novagrid = roles.find((r) => r.entityName === "NovaGrid Systems LLC")!;
    const sender = signatureOnlyForRoles(roles);
    const gate = evaluatePreparePacketGateFromRoles(roles, sender, []);
    expect(gate.canFinish).toBe(true);
    expect(gate.missingByParty[novagrid.roleId]).toBeUndefined();
    expect(gate.optionalSuggestedFieldsByRole[novagrid.roleId]?.length).toBeGreaterThan(0);
  });

  it("5. remove signature from NovaGrid → blocks only NovaGrid", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: FIVE_PARTY_NAMES[0],
      creatorEmail: "o@x.com",
      counterparties: cps,
    });
    const novagrid = roles.find((r) => r.entityName === "NovaGrid Systems LLC")!;
    const sender = signatureOnlyForRoles(roles.filter((r) => r.roleId !== novagrid.roleId));
    const gate = evaluatePreparePacketGateFromRoles(roles, sender, []);
    expect(gate.canFinish).toBe(false);
    expect(gate.missingSignatureRoles).toHaveLength(1);
    expect(gate.missingSignatureRoles[0]?.displayName).toBe("NovaGrid Systems LLC");
    expect(gate.missingByParty[novagrid.roleId]).toEqual(["signature"]);
  });

  it("6. initials-only does not satisfy signature requirement", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [],
    });
    const owner = roles[0]!;
    const sender: PlacedSigningField[] = [
      stampSenderFieldWithPrepareRole(
        {
          id: "ini",
          type: "initials",
          page: 0,
          x: 0.1,
          y: 0.1,
          width: 0.1,
          height: 0.04,
          autoInitials: true,
        },
        owner,
      ),
    ];
    const gate = evaluatePreparePacketGateFromRoles(roles, sender, []);
    expect(gate.canFinish).toBe(false);
    expect(gate.missingByParty[owner.roleId]).toContain("signature");
  });
});

describe("prepare placement UI copy guards", () => {
  const prepareSrc = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
  const completeSrc = readFileSync(join(__dirname, "StepCompleteAndSend.tsx"), "utf8");

  it("uses signature-only blocker copy in StepPrepareSignature", () => {
    expect(prepareSrc).toContain("PREPARE_BLOCKED_PANEL_TITLE");
    expect(prepareSrc).toContain("PREPARE_BLOCKED_PANEL_BODY");
    expect(prepareSrc).toContain("still needs a signature");
    expect(prepareSrc).not.toContain("Add these fields before continuing");
    expect(prepareSrc).not.toMatch(/still needs:\s*\{row\.missingLabels/);
    expect(PREPARE_BLOCKED_PANEL_TITLE).toBe("Add signatures before continuing");
  });

  it("does not mark printed name or title as required blocker copy by default", () => {
    expect(prepareSrc).not.toContain("Printed name still needs");
    expect(prepareSrc).not.toContain("Title still needs");
    expect(prepareSrc).toContain("PREPARE_OPTIONAL_FIELDS_HINT");
    expect(prepareSrc).toContain("PREPARE_PACKET_READY_COPY");
    expect(completeSrc).toContain("PREPARE_BLOCKED_PANEL_TITLE");
    expect(completeSrc).not.toContain("Required fields still missing");
    expect(PREPARE_PACKET_READY_COPY).toBe("Signature fields are ready — continue to signing links.");
  });
});
