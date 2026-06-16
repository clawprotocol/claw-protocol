/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgreementProgressTimeline } from "./AgreementProgressTimeline";
import type { AgreementTimelineStep } from "./dashboardWhatsNextPresentation";

describe("AgreementProgressTimeline (Test364)", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses neutral in-progress styling for pending Signed step", () => {
    const steps: AgreementTimelineStep[] = [
      { id: "draft_created", label: "Draft Created", state: "complete" },
      { id: "review_sent", label: "Review Sent", state: "complete" },
      { id: "reviews_approved", label: "Reviews Approved", state: "complete" },
      { id: "signature_links_prepared", label: "Signature Links Prepared", state: "complete" },
      { id: "signed", label: "Signed", state: "current" },
    ];
    render(<AgreementProgressTimeline steps={steps} />);
    const signed = screen.getByTestId("agreement-timeline-step-signed");
    expect(signed.getAttribute("data-timeline-state")).toBe("current");
    expect(signed.querySelector(".bg-sky-400")).toBeTruthy();
    expect(signed.querySelector(".bg-amber-400")).toBeNull();
  });

  it("keeps completed Signed step green", () => {
    const steps: AgreementTimelineStep[] = [
      { id: "signed", label: "Signed", state: "complete" },
    ];
    render(<AgreementProgressTimeline steps={steps} />);
    const signed = screen.getByTestId("agreement-timeline-step-signed");
    expect(signed.querySelector(".bg-emerald-500")).toBeTruthy();
  });
});
