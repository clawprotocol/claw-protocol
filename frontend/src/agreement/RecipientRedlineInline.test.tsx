/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecipientRedlineInline } from "./RecipientRedlineInline";
import type { RedlineResult } from "../vs01/agreementRedline";

describe("RecipientRedlineInline", () => {
  afterEach(() => cleanup());

  it("applies paragraph-friendly wrapping when paragraphBreaks is set", () => {
    const redline: RedlineResult = {
      hasChanges: true,
      segments: [{ type: "same", text: "Line one\nLine two" }],
    };
    const { container } = render(<RecipientRedlineInline redline={redline} paragraphBreaks />);
    const span = container.querySelector("[data-redline='same']");
    expect(span?.className).toMatch(/whitespace-pre-wrap/);
  });

  it("renders insert-only segments with data-redline insert", () => {
    render(
      <RecipientRedlineInline
        segments={[
          { type: "same", text: "Prefix " },
          { type: "insert", text: "NEW" },
        ]}
        contrast="high"
      />,
    );
    const root = screen.getByTestId("recipient-redline-inline");
    expect(root.querySelector('[data-redline="insert"]')?.textContent).toContain("NEW");
    expect(root.querySelector('[data-redline="delete"]')).toBeNull();
  });

  it("renders insert and delete markers for track-changes view", () => {
    const redline: RedlineResult = {
      hasChanges: true,
      segments: [
        { type: "same", text: "Keep " },
        { type: "delete", text: "old " },
        { type: "insert", text: "new " },
        { type: "same", text: "end." },
      ],
    };
    render(<RecipientRedlineInline redline={redline} />);
    const root = screen.getByTestId("recipient-redline-inline");
    expect(root.querySelector('[data-redline="delete"]')?.textContent).toContain("old");
    expect(root.querySelector('[data-redline="insert"]')?.textContent).toContain("new");
  });
});
