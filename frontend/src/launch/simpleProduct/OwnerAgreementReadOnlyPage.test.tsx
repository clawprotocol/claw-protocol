/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as ownerAgreementReadOnlyView from "../ownerAgreementReadOnlyView";
import { OwnerAgreementReadOnlyPage } from "./OwnerAgreementReadOnlyPage";

const mockNavigate = vi.fn();

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/agreements/ag_view/view",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

function pendingReviewDraft(): AgreementDraft {
  return {
    id: "ag_view",
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: "Blue Canyon LLC", role: "party" },
      { id: "p2", name: "Iron Vale Systems Inc", role: "reviewer", email: "iron@test.com" },
    ],
    purpose: "Mutual consulting services between the parties.",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
    audit_log: [{ event_type: "review_sent", at: "2026-01-02T00:00:00.000Z" }],
  } as AgreementDraft;
}

describe("OwnerAgreementReadOnlyPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("renders canonical Pro document surface without negotiate workspace chrome", async () => {
    const draft = pendingReviewDraft();
    const premiumHtml =
      '<h1>MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT</h1>' +
      '<h2 class="premium-doc-section-heading">1. Services and Deliverables</h2>' +
      "<p>Service Provider shall deliver consulting services.</p>" +
      '<p class="premium-doc-signature-party-start">CLIENT: Blue Canyon Analytics LLC</p>';

    vi.spyOn(ownerAgreementReadOnlyView, "loadOwnerAgreementReadOnlyPreview").mockResolvedValue({
      draft,
      html: premiumHtml,
      corpusText: "fixture corpus",
      usesPremiumDocument: true,
    });

    render(<OwnerAgreementReadOnlyPage agreementId="ag_view" />);

    await waitFor(() => {
      expect(screen.getByTestId("premium-agreement-readonly-article")).toBeTruthy();
    });

    expect(screen.getByTestId("owner-agreement-readonly-page")).toBeTruthy();
    expect(screen.getByTestId("owner-agreement-readonly-status").textContent).toContain(
      "Waiting for reviewer approval",
    );
    expect(screen.getByText("Consulting Agreement")).toBeTruthy();
    expect(screen.queryByText("Negotiate draft")).toBeNull();
    expect(screen.queryByText("Reset draft")).toBeNull();
    expect(screen.queryByText("Agreement Memory")).toBeNull();

    const article = screen.getByTestId("premium-agreement-readonly-article");
    expect(article.querySelector("h1")?.textContent).toContain("MUTUAL CONSULTING");
    expect(article.querySelectorAll("h2.premium-doc-section-heading").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByTestId("owner-agreement-readonly-back"));
    expect(mockNavigate).toHaveBeenCalledWith("/app");
  });
});
