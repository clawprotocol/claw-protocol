/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardIndexLoadingShell } from "./DashboardIndexLoadingShell";

describe("DashboardIndexLoadingShell", () => {
  it("renders chrome, Create CTA, and skeleton cards while index loads", () => {
    const onCreate = vi.fn();
    render(<DashboardIndexLoadingShell onCreateAgreement={onCreate} cardCount={3} />);
    expect(screen.getByTestId("dashboard-index-loading-shell")).toBeTruthy();
    expect(screen.getByTestId("dashboard-create-new-agreement")).toBeTruthy();
    expect(screen.getByTestId("dashboard-kpi-loading")).toBeTruthy();
    expect(screen.getByTestId("dashboard-index-loading-list").children.length).toBe(3);
    expect(screen.getByText("Loading agreements…")).toBeTruthy();
  });
});
