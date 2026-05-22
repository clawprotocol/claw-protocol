/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Vs01PrepareSignerMetadataPanel } from "./vs01PrepareSignerMetadataPanel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { labelForPreparePlacedField } from "./signingFields";

describe("Vs01PrepareSignerMetadataPanel", () => {
  it("shows compact summary when signer metadata is already known", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_panel",
      creatorName: "Redwood Peak Ventures LLC",
      creatorEmail: "o@x.com",
      ownerSignerName: "Redwood Santa",
      ownerSignerTitle: "Honcho",
      counterparties: [],
    });
    render(
      <Vs01PrepareSignerMetadataPanel
        role={roles[0]!}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/Representative:/)).toBeTruthy();
    expect(screen.getByText("Redwood Santa")).toBeTruthy();
    expect(screen.queryByText("Signer name not set")).toBeNull();
    cleanup();
  });

  it("shows editor when signer name is missing", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_panel_missing",
      creatorName: "Atlas Harbor Technologies Inc.",
      creatorEmail: "a@x.com",
      counterparties: [{ id: "cp", name: "Atlas Harbor Technologies Inc.", email: "a@x.com" }],
    });
    render(
      <Vs01PrepareSignerMetadataPanel
        role={roles[1]!}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/Signer details optional|Signature label can be customized/i)).toBeTruthy();
    cleanup();
  });

  it("does not show Signer name not set when counterparty has email only", () => {
    const roles = buildVs01PrepareSigningRoles({
      agreementId: "ag_email_only",
      creatorName: "Owner Co",
      creatorEmail: "owner@co.com",
      ownerSignerName: "Owner Person",
      counterparties: [
        {
          id: "cp2",
          name: "Beta LLC",
          email: "counterparty@beta.com",
          signerName: "",
          signerTitle: "",
        },
      ],
    });
    render(<Vs01PrepareSignerMetadataPanel role={roles[1]!} onPatch={vi.fn()} />);
    expect(screen.queryByText("Signer name not set")).toBeNull();
    expect(screen.getByText(/Signer details optional/i)).toBeTruthy();
    cleanup();
  });
});

describe("labelForPreparePlacedField", () => {
  it("distinguishes title and custom text", () => {
    expect(labelForPreparePlacedField("text", "title")).toBe("Title");
    expect(labelForPreparePlacedField("text", "custom")).toBe("Custom text");
    expect(labelForPreparePlacedField("signature")).toBe("Signature");
  });
});
