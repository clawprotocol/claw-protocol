/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchFailureState } from "./LaunchFailureState";
import { NotFoundPage } from "./NotFoundPage";
import { BillingCancellationPanel } from "./BillingCancellationPanel";
import { LAWDOG_SUPPORT_EMAIL } from "./supportContact";

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate: vi.fn(), pathname: "/", search: "" }),
}));

afterEach(() => {
  cleanup();
});

vi.mock("../access/AccessContext", () => ({
  useAccess: () => ({ tier: "free" }),
}));

describe("LaunchFailureState", () => {
  it("renders not-found with support contact", () => {
    render(
      <LaunchFailureState
        kind="not_found"
        message="We could not find this page."
        primaryAction={{ label: "Home", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByTestId("launch-failure-not_found")).toBeTruthy();
    expect(screen.getByText("We could not find this page.")).toBeTruthy();
    expect(screen.getByRole("link", { name: LAWDOG_SUPPORT_EMAIL }).getAttribute("href")).toBe(
      `mailto:${LAWDOG_SUPPORT_EMAIL}`,
    );
  });

  it("renders envelope invalid-link variant for recipients", () => {
    render(
      <LaunchFailureState
        kind="invalid_link"
        variant="envelope"
        message="This link is invalid or expired."
        primaryAction={{ label: "Go to home", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByTestId("launch-failure-invalid_link")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Link unavailable" })).toBeTruthy();
  });

  it("renders forbidden state for gated routes", () => {
    render(
      <LaunchFailureState
        kind="forbidden"
        message="Operator analytics routes are not available."
        primaryAction={{ label: "Back", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByTestId("launch-failure-forbidden")).toBeTruthy();
    expect(screen.getByText("Access not available")).toBeTruthy();
  });
});

describe("NotFoundPage", () => {
  it("shows canonical not-found copy", () => {
    render(<NotFoundPage />);
    expect(screen.getByTestId("launch-failure-not_found")).toBeTruthy();
    expect(screen.getByText(/could not find a page at this address/i)).toBeTruthy();
  });
});

describe("BillingCancellationPanel", () => {
  it("links to support-backed cancellation without portal claims", () => {
    render(<BillingCancellationPanel workspaceId="org-demo" />);
    const panel = screen.getByTestId("billing-cancellation-panel");
    const link = within(panel).getByRole("link", { name: /to cancel$/i });
    expect(link.getAttribute("href")).toContain(`mailto:${LAWDOG_SUPPORT_EMAIL}`);
    expect(link.getAttribute("href")).toContain("workspace%20org-demo");
    expect(screen.getByText(/do not offer a self-serve billing portal/i)).toBeTruthy();
  });
});
