/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PremiumAgreementCopyButton } from "./PremiumAgreementCopyButton";

describe("PremiumAgreementCopyButton", () => {
  it("renders Copy agreement and copies plain text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    render(
      <PremiumAgreementCopyButton
        getPlainText={() => "x".repeat(2_000)}
        minLen={500}
        data-testid="premium-copy-agreement"
      />,
    );
    const btn = screen.getByTestId("premium-copy-agreement");
    expect(btn.textContent).toContain("Copy agreement");
    fireEvent.click(btn);
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("x".repeat(2_000));
  });
});
