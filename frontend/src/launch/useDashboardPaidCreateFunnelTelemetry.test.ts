/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { CreateUiStage } from "../components/agreements/createUiStage";
import {
  clearLastLoggedDashboardPaidCreateScreenForTests,
  logDashboardPaidCreateScreenTransition,
} from "./paidDashboardCreateFunnel";
import { drainProductEventsForTests } from "../lib/experimentation/productEvents";
import { useDashboardPaidCreateFunnelTelemetry } from "./useDashboardPaidCreateFunnelTelemetry";
import type { UseDashboardPaidCreateFunnelTelemetryArgs } from "./useDashboardPaidCreateFunnelTelemetry";

vi.mock("./paidDashboardCreateFunnel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paidDashboardCreateFunnel")>();
  return {
    ...actual,
    logDashboardPaidCreateScreenTransition: vi.fn(actual.logDashboardPaidCreateScreenTransition),
  };
});

describe("useDashboardPaidCreateFunnelTelemetry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    drainProductEventsForTests();
    clearLastLoggedDashboardPaidCreateScreenForTests();
    vi.mocked(logDashboardPaidCreateScreenTransition).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs when enabled and display phase changes", () => {
    const initial: UseDashboardPaidCreateFunnelTelemetryArgs = {
      enabled: true,
      onDashboard: false,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "intake",
      createFlowPhase: "capturing_input",
      agreementId: "ag_hook_1",
    };
    const { rerender } = renderHook(
      (props: UseDashboardPaidCreateFunnelTelemetryArgs) =>
        useDashboardPaidCreateFunnelTelemetry(props),
      { initialProps: initial },
    );

    expect(logDashboardPaidCreateScreenTransition).toHaveBeenCalledWith(
      expect.objectContaining({ screen: "create_intake", agreementId: "ag_hook_1" }),
    );
    vi.mocked(logDashboardPaidCreateScreenTransition).mockClear();

    rerender({
      ...initial,
      displayPhase: "generating_draft",
      createFlowPhase: "generating_draft",
      premiumPostCheckoutPhase: "processing",
    });

    expect(logDashboardPaidCreateScreenTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: "generating",
        previousScreen: "create_intake",
        agreementId: "ag_hook_1",
      }),
    );
  });

  it("does not log when disabled", () => {
    renderHook(() =>
      useDashboardPaidCreateFunnelTelemetry({
        enabled: false,
        onDashboard: false,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "intake",
        createFlowPhase: "capturing_input",
      }),
    );
    expect(logDashboardPaidCreateScreenTransition).not.toHaveBeenCalled();
  });

  it("bridges previous screen from dashboard navigation log", () => {
    logDashboardPaidCreateScreenTransition({ screen: "dashboard" });
    vi.mocked(logDashboardPaidCreateScreenTransition).mockClear();

    renderHook(() =>
      useDashboardPaidCreateFunnelTelemetry({
        enabled: true,
        onDashboard: false,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "intake",
        createFlowPhase: "capturing_input",
        agreementId: "ag_bridge",
      }),
    );

    expect(logDashboardPaidCreateScreenTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        screen: "create_intake",
        previousScreen: "dashboard",
      }),
    );
  });
});
