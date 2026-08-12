/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateAccessChoicePanel } from "./CreateAccessChoicePanel";

describe("CreateAccessChoicePanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders unentitled signed-in access choice without editor chrome", () => {
    render(
      <CreateAccessChoicePanel
        onRequestGenesis={() => undefined}
        onChoosePro={() => undefined}
        onBackToDashboard={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: /continue with lawdog/i })).toBeTruthy();
    // Genesis is affiliate-only — no buyer request CTA / administrator-granted Genesis path.
    expect(screen.queryByText(/administrator-granted/i)).toBeNull();
    expect(screen.queryByTestId("create-access-choice-request-genesis")).toBeNull();
    expect(screen.getByText(/genesis is an affiliate program/i)).toBeTruthy();
    expect(screen.getByTestId("create-access-choice-choose-pro")).toBeTruthy();
    expect(screen.getByTestId("create-access-choice-back")).toBeTruthy();
    expect(screen.queryByTestId("create-access-choice-view-agreement")).toBeNull();
    expect(screen.queryByText(/describe your agreement/i)).toBeNull();
  });

  it("shows View your agreement only when backend confirms an accessible agreement", () => {
    const onView = vi.fn();
    const { rerender } = render(
      <CreateAccessChoicePanel
        onRequestGenesis={() => undefined}
        onChoosePro={() => undefined}
        onBackToDashboard={() => undefined}
        hasAccessibleAgreement={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /view your agreement/i })).toBeNull();

    rerender(
      <CreateAccessChoicePanel
        onRequestGenesis={() => undefined}
        onChoosePro={() => undefined}
        onBackToDashboard={() => undefined}
        hasAccessibleAgreement
        onViewAgreement={onView}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /view your agreement/i }));
    expect(onView).toHaveBeenCalled();
  });
});
