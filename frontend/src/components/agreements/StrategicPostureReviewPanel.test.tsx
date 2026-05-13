/** @vitest-environment jsdom */
/**
 * Render coverage for the additive Strategic Posture Review panel.
 *
 * Acceptance:
 *   • absent posture data (undefined / null / empty object) → renders nothing
 *     (existing review surface is unchanged when the optional prop isn't supplied)
 *   • findings render with category, observation, why-it-matters, suggested update
 *   • each suggested-update block exposes a copy control with stable test ids
 *   • missing companion documents render when present
 *   • disclaimer always renders inside the panel header / footer
 *   • backward compatibility: the panel does not register any global side effects
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { StrategicPostureReviewPanel } from "./StrategicPostureReviewPanel";
import {
  STRATEGIC_POSTURE_DISCLAIMER,
  buildStrategicPostureReviewFromText,
  type StrategicPostureReview,
} from "./strategicPostureReview";
import { SERVICES_AGREEMENT_FIXTURE } from "./strategicPostureReview.test";

afterEach(() => cleanup());

describe("StrategicPostureReviewPanel — absent posture data", () => {
  it("renders nothing when posture is undefined", () => {
    const { container } = render(<StrategicPostureReviewPanel />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("strategic-posture-review-panel")).toBeNull();
  });

  it("renders nothing when posture is null", () => {
    const { container } = render(<StrategicPostureReviewPanel posture={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when posture has no findings, no missing docs, no summary", () => {
    const { container } = render(
      <StrategicPostureReviewPanel posture={{ fail_soft: true }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when findings is an empty array", () => {
    const { container } = render(
      <StrategicPostureReviewPanel posture={{ findings: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("StrategicPostureReviewPanel — fixture-driven rendering", () => {
  const fixturePosture: StrategicPostureReview = buildStrategicPostureReviewFromText(
    SERVICES_AGREEMENT_FIXTURE,
  );

  it("renders the calm card header and the optional · diligence prep tag", () => {
    render(<StrategicPostureReviewPanel posture={fixturePosture} />);
    const panel = screen.getByTestId("strategic-posture-review-panel");
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("Strategic Posture Review");
    expect(panel.textContent).toMatch(/Optional · diligence prep/i);
  });

  it("renders the summary text when present", () => {
    render(<StrategicPostureReviewPanel posture={fixturePosture} />);
    const summary = screen.getByTestId("strategic-posture-summary");
    expect(summary.textContent ?? "").toMatch(/Operator-style notes/i);
  });

  it("renders one findings list item per finding with calm severity chip", () => {
    render(<StrategicPostureReviewPanel posture={fixturePosture} />);
    const list = screen.getByTestId("strategic-posture-findings");
    expect(list.children.length).toBe((fixturePosture.findings ?? []).length);
    // Severity chips are calm, not alarming.
    const chipText = (
      screen.getAllByTestId(/^strategic-posture-severity-\d+$/).map((n) => n.textContent ?? "")
    ).join(" ");
    expect(chipText).toMatch(/Diligence gap|Future-proofing|Consider tightening/i);
    expect(chipText).not.toMatch(/CRITICAL|INVALID|UNENFORCEABLE/i);
  });

  it("renders Why it matters and Suggested update blocks for the first finding", () => {
    render(<StrategicPostureReviewPanel posture={fixturePosture} />);
    const firstRow = screen.getByTestId("strategic-posture-finding-0");
    expect(firstRow.textContent).toMatch(/Why it matters:/i);
    // The suggested-update block has a stable test id derived from category slug + index.
    const suggested = firstRow.querySelector('[data-testid^="strategic-posture-suggested-update-"]');
    expect(suggested).toBeTruthy();
  });

  it("renders missing companion documents when supplied", () => {
    render(<StrategicPostureReviewPanel posture={fixturePosture} />);
    const block = screen.getByTestId("strategic-posture-missing-companions");
    expect(block.textContent).toMatch(/Contributor IP Assignment Packet/i);
  });

  it("renders the disclaimer with software-assistance framing", () => {
    render(<StrategicPostureReviewPanel posture={fixturePosture} />);
    expect(screen.getByTestId("strategic-posture-disclaimer").textContent).toBe(
      STRATEGIC_POSTURE_DISCLAIMER,
    );
  });

  it("hides the posture-score chip in fail_soft mode even when a score is supplied", () => {
    render(
      <StrategicPostureReviewPanel
        posture={{ ...fixturePosture, posture_score: 72, fail_soft: true }}
      />,
    );
    expect(screen.queryByTestId("strategic-posture-score")).toBeNull();
  });

  it("renders the posture-score chip when supplied and not fail_soft", () => {
    render(
      <StrategicPostureReviewPanel
        posture={{ ...fixturePosture, posture_score: 72 }}
      />,
    );
    const chip = screen.getByTestId("strategic-posture-score");
    expect(chip.textContent ?? "").toMatch(/72/);
  });
});

describe("StrategicPostureReviewPanel — copy-to-clipboard control", () => {
  it("invokes navigator.clipboard.writeText with the suggested update", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const posture: StrategicPostureReview = {
      findings: [
        {
          category: "IP chain-of-title",
          severity: "medium",
          observation: "obs",
          why_it_matters: "why",
          suggested_update: "Each party agrees to execute such further documents.",
        },
      ],
    };
    render(<StrategicPostureReviewPanel posture={posture} />);
    const copy = screen.getByTestId("strategic-posture-copy-ip-chain-of-title-0");
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith("Each party agrees to execute such further documents.");
  });

  it("does not throw when clipboard is unavailable (fail-soft)", () => {
    Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: undefined });
    const posture: StrategicPostureReview = {
      findings: [
        {
          category: "IP chain-of-title",
          severity: "medium",
          observation: "obs",
          why_it_matters: "why",
          suggested_update: "Each party agrees to execute such further documents.",
        },
      ],
    };
    render(<StrategicPostureReviewPanel posture={posture} />);
    expect(() =>
      fireEvent.click(screen.getByTestId("strategic-posture-copy-ip-chain-of-title-0")),
    ).not.toThrow();
  });
});

describe("StrategicPostureReviewPanel — backward compatibility", () => {
  it("does not mount when omitted (consumers without the prop see no DOM)", () => {
    const { container } = render(
      <div data-testid="surrounding-review-surface">
        <p>existing review content</p>
        <StrategicPostureReviewPanel />
      </div>,
    );
    // Surrounding content survives untouched, panel is absent.
    expect(screen.getByTestId("surrounding-review-surface").textContent).toBe(
      "existing review content",
    );
    expect(container.querySelector('[data-testid="strategic-posture-review-panel"]')).toBeNull();
  });
});
