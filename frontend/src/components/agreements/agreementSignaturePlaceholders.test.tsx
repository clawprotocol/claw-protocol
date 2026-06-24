/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgreementSignaturePlaceholderGrid } from "./AgreementSignaturePlaceholderGrid";

const FIVE_PARTY_NAMES = [
  "Redwood Peak Ventures LLC",
  "Atlas Harbor Technologies Inc.",
  "Meridian Workforce Group LLC",
  "Prairie Signal Holdings LP",
  "NovaGrid Systems LLC",
];

describe("AgreementSignaturePlaceholderGrid", () => {
  it("renders one card per party name", () => {
    render(<AgreementSignaturePlaceholderGrid partyNames={FIVE_PARTY_NAMES} />);
    for (const name of FIVE_PARTY_NAMES) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getAllByText(/Name · Title · Date/i)).toHaveLength(5);
  });
});

describe("StarterDraftDocumentSurface signature placeholders (static)", () => {
  const surface = readFileSync(join(__dirname, "StarterDraftDocumentSurface.tsx"), "utf8");

  it("does not render decorative signature cards in free starter review preview", () => {
    expect(surface).not.toContain("AgreementSignaturePlaceholderGrid");
    expect(surface).not.toMatch(/\["Party A",\s*"Party B"\]\.map/);
  });
});
