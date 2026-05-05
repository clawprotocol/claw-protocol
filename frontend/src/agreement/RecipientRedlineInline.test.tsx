/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecipientRedlineInline } from "./RecipientRedlineInline";
import type { RedlineResult } from "../vs01/agreementRedline";

describe("RecipientRedlineInline", () => {
  afterEach(() => cleanup());

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
