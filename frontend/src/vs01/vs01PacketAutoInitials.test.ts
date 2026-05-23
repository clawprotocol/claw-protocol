/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  buildPrepareAutoInitialsForAllRoles,
  prepareAutoInitialsSkipKey,
} from "./vs01PrepareFieldPlacement";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { evaluatePreparePacketGateFromRoles } from "./vs01SignerFieldAssignment";
import { buildCorpusSimulatedPageLayouts } from "./vs01PageTextLayout";

const AUTO_INITIALS_CORPUS = `Services Agreement between Owner Co and Alpha LLC.

${"Operational terms apply throughout the engagement period. ".repeat(20)}

1. Scope
Provider delivers services.

IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Owner Co
By: ___

SERVICE PROVIDER:
Alpha LLC
By: ___
`;

describe("packet-level auto initials", () => {
  it("places initials for every role on every page without duplicates", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_auto",
      creatorName: "Owner Co",
      creatorEmail: "o@x.com",
      counterparties: [
        { id: "c1", name: "Alpha LLC", email: "a@x.com" },
        { id: "c2", name: "Beta Inc", email: "b@x.com" },
      ],
    });
    const pageCount = 2;
    const pageLayouts = buildCorpusSimulatedPageLayouts(AUTO_INITIALS_CORPUS, pageCount);
    const autos = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "X", initials: "X" }),
      corpusText: AUTO_INITIALS_CORPUS,
      pageLayouts,
    });
    expect(autos.length).toBeGreaterThan(0);
    expect(autos).toHaveLength(roles.length * pageCount);
    const ids = autos.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not count auto initials toward prepare completion gate", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_gate",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [{ id: "c1", name: "Alpha", email: "a@x.com" }],
    });
    const pageCount = 3;
    const pageLayouts = buildCorpusSimulatedPageLayouts(AUTO_INITIALS_CORPUS, pageCount);
    const autos = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "O", initials: "O" }),
      corpusText: AUTO_INITIALS_CORPUS,
      pageLayouts,
    });
    const gate = evaluatePreparePacketGateFromRoles(roles, autos, []);
    expect(gate.canFinish).toBe(false);
    expect(gate.missingByParty[roles[0]!.roleId]).toContain("signature");
  });

  it("respects per-role skipped slots when re-enabled", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_skip",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [],
    });
    const roleId = roles[0]!.roleId;
    const skipped = new Set([prepareAutoInitialsSkipKey(roleId, 0)]);
    const pageCount = 2;
    const pageLayouts = buildCorpusSimulatedPageLayouts(AUTO_INITIALS_CORPUS, pageCount);
    const autos = buildPrepareAutoInitialsForAllRoles({
      roles,
      pageCount,
      skippedSlots: skipped,
      existingFields: [],
      valueCtxForRole: () => ({ typedName: "O", initials: "O" }),
      corpusText: AUTO_INITIALS_CORPUS,
      pageLayouts,
    });
    expect(autos.filter((f) => f.page === 0)).toHaveLength(0);
    expect(autos.some((f) => f.page === 1)).toBe(true);
  });
});
