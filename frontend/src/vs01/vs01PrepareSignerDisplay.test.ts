import { describe, expect, it } from "vitest";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  resolvePreparePrintedNameDisplay,
  VS01_PREPARE_SIGNATURE_COUNTERPARTY_BODY,
} from "./vs01PrepareSignerDisplay";
import { prepareTemplateDisplayForField } from "./vs01PrepareTemplateField";

describe("resolvePreparePrintedNameDisplay", () => {
  const roles = buildVs01PrepareSigningRoles({
    agreementId: "ag_display",
    creatorName: "Owner LLC",
    creatorEmail: "o@x.com",
    counterparties: [{ id: "atlas", name: "Atlas Harbor Technologies Inc.", email: "a@x.com" }],
  });
  const cp = roles[1]!;

  it("unknown signerName shows placeholder with party sublabel, not entity as human name", () => {
    const d = resolvePreparePrintedNameDisplay(cp, "prepare_display");
    expect(d.primary).toBe("Signer name");
    expect(d.sublabel).toBe("for Atlas Harbor Technologies Inc.");
    expect(d.isPlaceholder).toBe(true);
    expect(d.primary).not.toContain("Atlas Harbor");
  });

  it("known signerName uses human name", () => {
    const withName = { ...cp, signerName: "Jordan Lee" };
    const d = resolvePreparePrintedNameDisplay(withName, "prepare_display");
    expect(d.primary).toBe("Jordan Lee");
    expect(d.isPlaceholder).toBe(false);
    expect(d.sublabel).toBeUndefined();
  });
});

describe("counterparty signature template", () => {
  it("uses Signer will sign here and party header", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_sig",
      creatorName: "Owner",
      creatorEmail: "o@x.com",
      counterparties: [{ id: "c1", name: "Atlas LLC", email: "a@x.com" }],
    });
    const cp = roles[1]!;
    const display = prepareTemplateDisplayForField(
      {
        id: "s1",
        type: "signature",
        page: 0,
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.07,
        value: "",
      },
      cp,
    );
    expect(display.body).toBe(VS01_PREPARE_SIGNATURE_COUNTERPARTY_BODY);
    expect(display.assigneeLine).toContain("Atlas LLC");
    expect(display.awaitsSignerInput).toBe(true);
  });
});
