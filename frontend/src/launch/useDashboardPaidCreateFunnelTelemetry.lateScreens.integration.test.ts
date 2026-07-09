/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { CreateUiStage } from "../components/agreements/createUiStage";
import {
  clearLastLoggedDashboardPaidCreateScreenForTests,
  DASHBOARD_PAID_CREATE_SCREEN_FUNNEL_EVENT,
} from "./paidDashboardCreateFunnel";
import {
  loadPaidFunnelEvents,
  PAID_FUNNEL_EVENT_STORAGE_KEY,
} from "../lib/experimentation/paidFunnelLocalStorage";
import { drainProductEventsForTests } from "../lib/experimentation/productEvents";
import { useDashboardPaidCreateFunnelTelemetry } from "./useDashboardPaidCreateFunnelTelemetry";
import { writeSigningPacketStatus } from "../vs01/vs01SigningPacketStatusStore";

/** Production-level hook emission (no mocked logger). */
describe("useDashboardPaidCreateFunnelTelemetry late-screen runtime emission", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    drainProductEventsForTests();
    clearLastLoggedDashboardPaidCreateScreenForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("emits signature_links when VS01 packet is prepared on recipients stage", () => {
    writeSigningPacketStatus({
      agreementId: "ag_hook_late",
      updatedAt: new Date().toISOString(),
      bySignerKey: { owner: "waiting", party_a: "waiting" },
      fullySigned: false,
    });

    renderHook(() =>
      useDashboardPaidCreateFunnelTelemetry({
        enabled: true,
        onDashboard: false,
        createUiStage: CreateUiStage.RECIPIENTS,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
        premiumSendPathUnlocked: true,
        agreementId: "ag_hook_late",
      }),
    );

    const rows = loadPaidFunnelEvents();
    expect(rows.some((r) => r.name === DASHBOARD_PAID_CREATE_SCREEN_FUNNEL_EVENT)).toBe(true);
    expect(rows.some((r) => r.render_source === "signature_links")).toBe(true);
    expect(localStorage.getItem(PAID_FUNNEL_EVENT_STORAGE_KEY)).toContain("signature_links");
  });

  it("emits completed_proof when packet is fully signed on recipients stage", () => {
    writeSigningPacketStatus({
      agreementId: "ag_hook_proof",
      updatedAt: new Date().toISOString(),
      bySignerKey: { owner: "signed", party_a: "signed" },
      fullySigned: true,
    });

    renderHook(() =>
      useDashboardPaidCreateFunnelTelemetry({
        enabled: true,
        onDashboard: false,
        createUiStage: CreateUiStage.RECIPIENTS,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
        premiumSendPathUnlocked: true,
        agreementId: "ag_hook_proof",
      }),
    );

    const rows = loadPaidFunnelEvents();
    expect(rows.some((r) => r.render_source === "completed_proof")).toBe(true);
  });
});
