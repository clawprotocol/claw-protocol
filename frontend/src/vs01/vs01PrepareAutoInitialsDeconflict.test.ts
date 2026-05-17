/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { Vs01Counterparty } from "./types";
import {
  buildPrepareAutoInitialsEveryPage,
  prepareAutoInitialsFieldId,
} from "./vs01PrepareFieldPlacement";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { fieldRectsOverlap, findNonOverlappingPrepareRect, prepareAutoInitialsLaneAnchor } from "./signingFields";
import {
  resolvePrepareSignerDisplayName,
  resolvePrepareSignerTitleDisplay,
  VS01_PREPARE_SIGNER_NAME_PLACEHOLDER,
} from "./vs01PrepareSignerDisplay";
import { resolveVs01FieldValueForRole } from "./vs01FieldValueResolution";
import { prepareTemplateDisplayForField } from "./vs01PrepareTemplateField";

const AG = "ag_vs01_prepare_deconflict";

function fivePartyRoles() {
  const cps: Vs01Counterparty[] = [
    { id: "p1", name: "Alpha LLC", email: "1@x.com" },
    { id: "p2", name: "Beta Inc", email: "2@x.com", signerName: "Bob Beta" },
    { id: "p3", name: "Gamma Corp", email: "3@x.com" },
    { id: "p4", name: "Delta LP", email: "4@x.com" },
  ];
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Redwood Owner",
    creatorEmail: "owner@x.com",
    counterparties: cps,
  });
}

describe("buildPrepareAutoInitialsEveryPage deconflict", () => {
  it("five-party initials every page are non-overlapping per page", () => {
    const roles = fivePartyRoles();
    let existing: ReturnType<typeof buildPrepareAutoInitialsEveryPage> = [];
    for (const role of roles) {
      const batch = buildPrepareAutoInitialsEveryPage({
        role,
        pageCount: 2,
        skippedPages: new Set(),
        existingFields: existing,
        valueCtx: { typedName: "O", initials: "O" },
      });
      existing = [...existing, ...batch];
    }
    expect(existing.length).toBe(roles.length * 2);
    for (const page of [0, 1]) {
      const onPage = existing.filter((f) => f.page === page);
      for (let i = 0; i < onPage.length; i++) {
        for (let j = i + 1; j < onPage.length; j++) {
          expect(fieldRectsOverlap(onPage[i]!, onPage[j]!)).toBe(false);
        }
      }
    }
    const anchors = roles.map((r) => prepareAutoInitialsLaneAnchor(r.partyIndex, { width: 0.075, height: 0.035 }));
    const ys = anchors.map((a) => a.y);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it("re-running checkbox does not duplicate initials for same role/page", () => {
    const roles = fivePartyRoles();
    const owner = roles[0]!;
    const first = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 3,
      skippedPages: new Set(),
      existingFields: [],
      valueCtx: { typedName: "O", initials: "O" },
    });
    const second = buildPrepareAutoInitialsEveryPage({
      role: owner,
      pageCount: 3,
      skippedPages: new Set(),
      existingFields: first,
      valueCtx: { typedName: "O", initials: "O" },
    });
    expect(second.length).toBe(0);
    expect(first.map((f) => f.id)).toEqual([
      prepareAutoInitialsFieldId(owner.roleId, 0),
      prepareAutoInitialsFieldId(owner.roleId, 1),
      prepareAutoInitialsFieldId(owner.roleId, 2),
    ]);
  });
});

describe("findNonOverlappingPrepareRect", () => {
  it("nudges within same page and clamps to page bounds", () => {
    const desired = { x: 0.82, y: 0.91, width: 0.075, height: 0.035 };
    const existing = [{ id: "b", page: 0, ...desired }];
    const out = findNonOverlappingPrepareRect({
      desiredRect: desired,
      page: 0,
      existingFields: existing,
    });
    expect(out.adjusted).toBe(true);
    expect(out.y).toBeLessThan(desired.y);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    expect(out.x + out.width).toBeLessThanOrEqual(1 + 1e-6);
    expect(out.y + out.height).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe("prepare signer name / title resolution", () => {
  it("entity-only counterparty does not become printed signer name", () => {
    const roles = fivePartyRoles();
    const atlas = roles.find((r) => r.partyId === "p1")!;
    const stored = resolveVs01FieldValueForRole({
      fieldType: "printed_name",
      role: atlas,
      mode: "prepare_stored",
    });
    expect(stored).toBe("");
    const disp = resolvePrepareSignerDisplayName(atlas, "prepare_display");
    expect(disp.isPlaceholder).toBe(true);
    expect(disp.value).toBe(VS01_PREPARE_SIGNER_NAME_PLACEHOLDER);
    const tpl = prepareTemplateDisplayForField(
      {
        id: "pn",
        type: "printed_name",
        page: 0,
        x: 0.1,
        y: 0.1,
        width: 0.28,
        height: 0.045,
        value: "",
        assignedSignerRoleKind: "counterparty",
      },
      atlas,
    );
    expect(tpl.body).toBe(VS01_PREPARE_SIGNER_NAME_PLACEHOLDER);
    expect(tpl.body).not.toContain("Alpha LLC");
  });

  it("known signerName carries through stored and display", () => {
    const roles = fivePartyRoles();
    const beta = roles.find((r) => r.partyId === "p2")!;
    expect(resolveVs01FieldValueForRole({
      fieldType: "printed_name",
      role: beta,
      mode: "prepare_stored",
    })).toBe("Bob Beta");
    expect(
      resolveVs01FieldValueForRole({
        fieldType: "printed_name",
        role: beta,
        mode: "prepare_display",
        storedValue: "",
      }),
    ).toBe("Bob Beta");
  });

  it("signerTitle is not invented", () => {
    const roles = fivePartyRoles();
    const cp = roles.find((r) => r.partyId === "p3")!;
    expect(resolveVs01FieldValueForRole({ fieldType: "text", role: cp, mode: "prepare_stored" })).toBe("");
    const titleDisp = resolvePrepareSignerTitleDisplay(cp, "prepare_display");
    expect(titleDisp.isPlaceholder).toBe(true);
    expect(titleDisp.value).toBe("Title");
    expect(titleDisp.value).not.toMatch(/Manager|Partner|Managing Member/i);
  });

  it("owner printed name behavior unchanged", () => {
    const roles = fivePartyRoles();
    const owner = roles[0]!;
    expect(
      resolveVs01FieldValueForRole({
        fieldType: "printed_name",
        role: owner,
        mode: "prepare_stored",
        ownerPad: { typedName: "Redwood Signer" },
      }),
    ).toBe("Redwood Signer");
  });

  it("recipient runtime can fill printed name from signer session", () => {
    const roles = fivePartyRoles();
    const atlas = roles.find((r) => r.partyId === "p1")!;
    expect(
      resolveVs01FieldValueForRole({
        fieldType: "printed_name",
        role: atlas,
        mode: "recipient_runtime",
        storedValue: "",
        signerRuntime: { typedName: "Alex Atlas" },
      }),
    ).toBe("Alex Atlas");
  });
});
