/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecipientSigningFieldOverlay } from "./RecipientSigningFieldOverlay";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { buildFullPacketManifestFromCanonicalModel } from "./vs01SigningPacketManifest";
import {
  countRecipientSigningActions,
  isRecipientSigningEditableType,
} from "./recipientSigningFieldUtils";
import { normalizedPdfRectToCssPercent } from "./vs01FieldCssGeometry";
import { repairFinalGradeGuidedCorpus } from "../components/agreements/guidedDealCompletion/guidedFinalGradeCorpus";
import { TEST74_BAD_GUIDED_CORPUS } from "../components/agreements/guidedDealCompletion/guidedFinalGradeCorpus.fixtures";
import type { Vs01RecipientPlacedField } from "./types";

const repairedCorpus = repairFinalGradeGuidedCorpus(TEST74_BAD_GUIDED_CORPUS, {
  authoritativePartyNames: ["Acme LLC", "Joe Smith"],
}).text;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test78",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function buildFixture() {
  const r = roles();
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: repairedCorpus,
    roles: r,
    initialsEnabled: true,
  });
  expect(model.allowed).toBe(true);
  const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
  return { model, manifest, roles: r };
}

function cpByIdFromRoles(r: ReturnType<typeof roles>): Map<string, import("./types").Vs01Counterparty> {
  return new Map(
    r.map((role) => {
      const id = role.vs01CounterpartyId ?? role.partyId;
      return [
        id,
        {
          id,
          name: role.signerName ?? "",
          email: role.signerEmail ?? "",
        },
      ];
    }),
  );
}

describe("recipient canonical placement (test78)", () => {
  it("canonical compact initials use model normalized x/y (not DOM shell)", () => {
    const { model, manifest, roles: r } = buildFixture();
    const witnessIdx = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    const bodyPage = model.pages.find((p) => p.pageIndex !== witnessIdx)!;
    const ownerCp = r[0]!.vs01CounterpartyId ?? r[0]!.partyId;
    const initials = manifest.find(
      (f) => f.type === "initials" && f.page === bodyPage.pageIndex && f.counterpartyId === ownerCp,
    )!;
    const css = normalizedPdfRectToCssPercent(initials);

    render(
      <RecipientSigningFieldOverlay
        field={initials}
        lockedCounterpartyId={ownerCp}
        lockedSignerRoleId={r[0]!.roleId}
        recipientAgreementId="ag_test78"
        cpById={cpByIdFromRoles(r)}
        onUpdateValue={() => {}}
        canonicalCompact
      />,
    );

    const el = screen.getByLabelText("Initials").closest(".vs01-sign-placement-box--initials") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.left).toBe(css.left);
    expect(el.style.top).toBe(css.top);
    expect(el.style.width).toBe(css.width);
    expect(el.style.height).toBe(css.height);
    expect(el.className).toContain("vs01-sign-placement-box--auto-initials");
    expect(el.closest(".vs01-initials-dom-field")).toBeNull();
    expect(rectContains(bodyPage.initialsBandRect, initials)).toBe(true);
  });

  it("canonical compact witness signature outer rect matches model geometry", () => {
    const { model, manifest, roles: r } = buildFixture();
    const witnessIdx = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    const ownerCp = r[0]!.vs01CounterpartyId ?? r[0]!.partyId;
    const sig = manifest.find(
      (f) => f.type === "signature" && f.page === witnessIdx && f.assignedPartyIndex === 0,
    )!;
    const css = normalizedPdfRectToCssPercent(sig);

    render(
      <RecipientSigningFieldOverlay
        field={sig}
        lockedCounterpartyId={ownerCp}
        lockedSignerRoleId={r[0]!.roleId}
        recipientAgreementId="ag_test78"
        cpById={cpByIdFromRoles(r)}
        onUpdateValue={() => {}}
        canonicalCompact
      />,
    );

    const el = screen.getByLabelText("Signature").closest(".vs01-sign-placement-box--signature") as HTMLElement;
    expect(el.style.left).toBe(css.left);
    expect(el.style.top).toBe(css.top);
    expect(el.style.width).toBe(css.width);
    expect(el.style.height).toBe(css.height);
    expect(el.className).not.toContain("vs01-recipient-signature-slot");
    expect(screen.getByText("Signature", { selector: ".vs01-sign-placement-label" })).toBeTruthy();
  });

  it("active signer action count is signature plus own body-page initials only", () => {
    const { model, manifest, roles: r } = buildFixture();
    const witnessIdx = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    const ownerCp = r[0]!.vs01CounterpartyId ?? r[0]!.partyId;
    const ownerFields = manifest.filter(
      (f) =>
        (f.assignedSignerRoleId === r[0]!.roleId || f.counterpartyId === ownerCp) &&
        (f.type === "signature" || f.type === "initials"),
    );
    const editable = ownerFields.filter((f) => isRecipientSigningEditableType(f.type));
    const bodyInitials = editable.filter((f) => f.type === "initials" && f.page !== witnessIdx);
    const signatures = editable.filter((f) => f.type === "signature");
    expect(signatures).toHaveLength(1);
    expect(bodyInitials.length).toBe(model.pages.length - 1);
    expect(countRecipientSigningActions(editable)).toBe(bodyInitials.length + 1);
  });

  it("initials off omits initials from manifest and action count", () => {
    const r = roles();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: repairedCorpus,
      roles: r,
      initialsEnabled: false,
    });
    expect(model.allowed).toBe(true);
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    expect(manifest.some((f) => f.type === "initials")).toBe(false);
    const ownerCp = r[0]!.vs01CounterpartyId ?? r[0]!.partyId;
    const ownerEditable = manifest.filter(
      (f) =>
        (f.assignedSignerRoleId === r[0]!.roleId || f.counterpartyId === ownerCp) &&
        isRecipientSigningEditableType(f.type),
    );
    expect(countRecipientSigningActions(ownerEditable)).toBe(1);
  });
});

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: Pick<Vs01RecipientPlacedField, "x" | "y" | "width" | "height">,
): boolean {
  return (
    inner.x >= outer.x - 0.0001 &&
    inner.y >= outer.y - 0.0001 &&
    inner.x + inner.width <= outer.x + outer.width + 0.0001 &&
    inner.y + inner.height <= outer.y + outer.height + 0.0001
  );
}
