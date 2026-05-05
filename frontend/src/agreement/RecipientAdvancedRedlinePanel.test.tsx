/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientAdvancedRedlinePanel } from "./RecipientAdvancedRedlinePanel";
import type { RedlineResult } from "../vs01/agreementRedline";

describe("RecipientAdvancedRedlinePanel", () => {
  afterEach(() => cleanup());

  it("keeps advanced compare collapsed and uses constrained scroll container when opened", async () => {
    const redline: RedlineResult = {
      hasChanges: true,
      segments: [
        { type: "same", text: "Keep " },
        { type: "insert", text: "new" },
      ],
    };
    render(
      <RecipientAdvancedRedlinePanel
        redline={redline}
        showTrackedChanges={true}
        proposedHtmlClean="<p>Clean proposed</p>"
      />,
    );
    const panel = screen.getByTestId("recipient-advanced-redline-panel");
    expect(panel.querySelector('[data-testid="recipient-advanced-redline-scroll"]')).toBeNull();

    const scroll = () => screen.getByTestId("recipient-advanced-redline-scroll");
    await userEvent.click(screen.getByRole("button", { name: /Show advanced full-document compare/i }));
    const el = scroll();
    expect(el.className).toMatch(/max-h-\[min\(32rem,70vh\)\]/);
    expect(el.className).toMatch(/overflow-auto/);
    expect(el.className).toMatch(/text-sm/);
    expect(el.className).not.toMatch(/text-xl/);
    expect(el.className).not.toMatch(/text-2xl/);
  });
});
