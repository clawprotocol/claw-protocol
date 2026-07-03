/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { AgreementPostGenerationFlow } from "./AgreementPostGenerationFlow";

const RED_MESA_DRAFT: AgreementDraft = {
  id: "ag-red-mesa",
  title: "Professional Services Agreement",
  jurisdiction: "Delaware",
  effective_date: "Upon full execution by all parties",
  purpose: "Professional services engagement.",
  payment_terms: "$96,000 payable in four milestones.",
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

describe("AgreementPostGenerationFlow", () => {
  it("starts on the ready summary card", () => {
    render(
      <AgreementPostGenerationFlow
        draft={RED_MESA_DRAFT}
        presentation="summary"
        onPresentationChange={() => {}}
        editorPanel={<div>Editor panel</div>}
      />,
    );
    expect(screen.getByTestId("agreement-ready-summary-card")).toBeTruthy();
    expect(screen.queryByText("Editor panel")).toBeNull();
    cleanup();
  });

  it("shows readonly panel after review action", () => {
    let mode: string | null = null;
    render(
      <AgreementPostGenerationFlow
        draft={RED_MESA_DRAFT}
        presentation="summary"
        onPresentationChange={(next) => {
          mode = next;
        }}
        editorPanel={<div>Editor panel</div>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review agreement" }));
    expect(mode).toBe("readonly");
    cleanup();
  });

  it("shows editor panel in editor mode", () => {
    render(
      <AgreementPostGenerationFlow
        draft={RED_MESA_DRAFT}
        presentation="editor"
        onPresentationChange={() => {}}
        editorPanel={<div>Editor panel</div>}
      />,
    );
    expect(screen.getByText("Editor panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to summary" })).toBeTruthy();
    cleanup();
  });
});
