/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PrepareSigningFieldBody } from "./vs01PrepareSigningFieldRender";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import type { PlacedSigningField } from "./signingFields";

const AG = "ag_prepare_sig_render";

describe("PrepareSigningFieldBody counterparty signature", () => {
  afterEach(() => {
    cleanup();
  });

  const roles = buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Redwood Peak Ventures LLC",
    creatorEmail: "owner@x.com",
    ownerSignerName: "Redwood Santa",
    counterparties: [
      {
        id: "c1",
        name: "Atlas Harbor Technologies Inc.",
        email: "a@x.com",
        signerName: "Jim Atlas",
      },
    ],
  });
  const owner = roles[0]!;
  const cp = roles[1]!;

  const ownerPad = { typedName: "Redwood Script Name", initials: "RS" };

  it("counterparty signature shows template text, not owner typedName or script", () => {
    const field: PlacedSigningField = {
      id: "sig-cp",
      type: "signature",
      page: 0,
      x: 0.2,
      y: 0.2,
      width: 0.34,
      height: 0.075,
      value: "",
      assignedSignerRoleKind: "counterparty",
      assignedSignerRoleId: cp.roleId,
    };
    render(
      <PrepareSigningFieldBody
        field={field}
        role={cp}
        ownerPreview={{
          signatureMode: "type",
          typedName: "Redwood Script Name",
          hasDrawn: false,
          uploadPreviewUrl: null,
        }}
        ownerPad={ownerPad}
        isSelected={false}
        busy={false}
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByText("SIGNATURE — Atlas Harbor Technologies Inc.")).toBeTruthy();
    expect(screen.getByText("Jim Atlas will sign here")).toBeTruthy();
    expect(screen.getByText("Private link signer · not signed yet")).toBeTruthy();
    expect(screen.queryByText("Redwood Script Name")).toBeNull();
    expect(screen.queryByText("Redwood Owner")).toBeNull();
  });

  it("owner signature shows party heading and explicit signer name when known", () => {
    const field: PlacedSigningField = {
      id: "sig-owner-known",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
      value: "",
      assignedSignerRoleKind: "owner",
      assignedSignerRoleId: owner.roleId,
    };
    const { container } = render(
      <PrepareSigningFieldBody
        field={field}
        role={owner}
        ownerPreview={{
          signatureMode: "type",
          typedName: "Script From Pad",
          hasDrawn: false,
          uploadPreviewUrl: null,
        }}
        ownerPad={{ typedName: "Script From Pad", initials: "SP" }}
        isSelected={false}
        busy={false}
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByText("SIGNATURE — Redwood Peak Ventures LLC")).toBeTruthy();
    expect(screen.getByText("Redwood Santa")).toBeTruthy();
    expect(screen.queryByText("Script From Pad")).toBeNull();
    expect(container.querySelector("[data-vs01-field-kind]")).toBeNull();
  });

  it("owner signature still previews owner typed name when signer metadata missing", () => {
    const rolesNoSigner = buildVs01PrepareSigningRoles({
      agreementId: AG,
      creatorName: "Redwood Peak Ventures LLC",
      creatorEmail: "owner@x.com",
      counterparties: [],
    });
    const ownerNoSigner = rolesNoSigner[0]!;
    const field: PlacedSigningField = {
      id: "sig-owner",
      type: "signature",
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.34,
      height: 0.075,
      value: "",
      assignedSignerRoleKind: "owner",
      assignedSignerRoleId: ownerNoSigner.roleId,
    };
    render(
      <PrepareSigningFieldBody
        field={field}
        role={ownerNoSigner}
        ownerPreview={{
          signatureMode: "type",
          typedName: "Redwood Script Name",
          hasDrawn: false,
          uploadPreviewUrl: null,
        }}
        ownerPad={ownerPad}
        isSelected={false}
        busy={false}
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByText("Redwood Script Name")).toBeTruthy();
    expect(screen.queryByText("Signer signs here")).toBeNull();
  });
});
