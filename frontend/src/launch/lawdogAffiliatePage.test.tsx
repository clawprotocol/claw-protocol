/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LawdogAffiliatePage } from "./LawdogAffiliatePage";

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/affiliate",
    search: "",
    hash: "",
    navigate: vi.fn(),
  }),
}));

describe("LawdogAffiliatePage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders referral link and earnings KPI cards", () => {
    render(<LawdogAffiliatePage />);
    expect(screen.getByTestId("affiliate-referral-link")).toBeTruthy();
    expect(screen.getByTestId("affiliate-referral-link").textContent).toMatch(/\/r\//);
    expect(screen.getByTestId("affiliate-kpi-referrals")).toBeTruthy();
    expect(screen.getByTestId("affiliate-kpi-active-subs")).toBeTruthy();
    expect(screen.getByTestId("affiliate-kpi-monthly")).toBeTruthy();
    expect(screen.getByTestId("affiliate-kpi-lifetime")).toBeTruthy();
    expect(screen.getByTestId("affiliate-copy-link").textContent).toContain("Copy Link");
  });
});
