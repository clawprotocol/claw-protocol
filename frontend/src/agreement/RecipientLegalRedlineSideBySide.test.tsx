/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { RecipientLegalRedlineSideBySide } from "./RecipientLegalRedlineSideBySide";

describe("RecipientLegalRedlineSideBySide", () => {
  it("aligns current and proposed 3.2 payment text on one row with Net 30 insert in proposed cell", () => {
    const cur = "Services Agreement\n\n3.2 Payment Schedule\nInvoices are due on receipt.";
    const prop = "Services Agreement\n\n3.2 Payment Schedule\nInvoices are due Net 30.";
    const doc = buildLegalRedlineDocumentViewModel(cur, prop);
    render(<RecipientLegalRedlineSideBySide document={doc} showTrackedChanges />);
    const rows = screen.getAllByTestId("recipient-side-by-side-row");
    const row = rows.find((r) => r.getAttribute("data-clause-number") === "3.2") as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const cells = row!.querySelectorAll("td");
    expect(cells.length).toBe(2);
    expect(cells[0]!.textContent).toMatch(/3\.2 Payment Schedule/);
    expect((cells[1] as HTMLElement).querySelector('[data-redline="insert"]')?.textContent).toMatch(/Net\s*30/i);
  });

  it("cleans up after unmount", () => {
    const doc = buildLegalRedlineDocumentViewModel("A", "A");
    const { unmount } = render(<RecipientLegalRedlineSideBySide document={doc} showTrackedChanges />);
    unmount();
    cleanup();
  });
});
