/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildAgreementReadySummaryModel } from "./agreementReadySummaryModel";
import { AgreementReadySummaryCard } from "./AgreementReadySummaryCard";

const RED_MESA_DRAFT: AgreementDraft = {
  id: "ag-red-mesa",
  title: "Professional Services Agreement",
  jurisdiction: "Delaware",
  effective_date: "Upon full execution by all parties",
  purpose:
    "Harbor Peak will evaluate warehouse operations, optimize inventory workflows, automate reporting, and implement dashboard integrations.",
  payment_terms:
    "$96,000 payable as: $24,000 on execution, $24,000 after assessment, $24,000 after implementation, $24,000 after final acceptance.",
  duration: "12 months",
  due_date: null,
  parties: [
    { id: "p1", name: "Red Mesa Logistics LLC", role: "client", email: "" },
    { id: "p2", name: "Harbor Peak Automation LLC", role: "service provider", email: "" },
  ],
  versions: [],
  audit_log: [],
  created_at: "2026-07-02T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
};

describe("buildAgreementReadySummaryModel", () => {
  it("builds summary fields for professional services intake draft", () => {
    const model = buildAgreementReadySummaryModel(RED_MESA_DRAFT);
    expect(model.title).toBe("Professional Services Agreement");
    expect(model.parties).toHaveLength(2);
    expect(model.parties[0]?.name).toMatch(/Red Mesa Logistics LLC/i);
    expect(model.parties[0]?.roleLabel).toBe("Client");
    expect(model.parties[1]?.roleLabel).toMatch(/Service Provider/i);
    expect(model.term).toBe("12 months");
    expect(model.payment).toMatch(/\$96,000/);
    expect(model.governingLaw).toMatch(/Delaware/i);
    expect(model.statusLabel).toBe("Ready for review");
  });
});

describe("AgreementReadySummaryCard", () => {
  it("shows review-first headline and hides edit-field affordances", () => {
    render(
      <AgreementReadySummaryCard
        draft={RED_MESA_DRAFT}
        onReviewAgreement={() => {}}
        onEditDetails={() => {}}
      />,
    );
    expect(screen.getByTestId("agreement-ready-summary-card")).toBeTruthy();
    expect(screen.getByText(/Your Professional Services Agreement is ready/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review agreement" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
    expect(screen.queryByText("Edit field")).toBeNull();
    expect(screen.queryByText("Update")).toBeNull();
    cleanup();
  });

  it("invokes review and edit callbacks", () => {
    let mode: string | null = null;
    render(
      <AgreementReadySummaryCard
        draft={RED_MESA_DRAFT}
        onReviewAgreement={() => {
          mode = "review";
        }}
        onEditDetails={() => {
          mode = "editor";
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review agreement" }));
    expect(mode).toBe("review");
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(mode).toBe("editor");
    cleanup();
  });
});
