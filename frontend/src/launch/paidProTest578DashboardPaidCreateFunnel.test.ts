/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLastLoggedDashboardPaidCreateScreenForTests,
  DASHBOARD_PAID_CREATE_SCREEN_FUNNEL_EVENT,
  logDashboardPaidCreateScreenTransition,
  resolveDashboardPaidCreateScreenForTelemetry,
  resolveDashboardPaidCreateTelemetryLateScreens,
} from "./paidDashboardCreateFunnel";
import {
  PAID_FUNNEL_EVENT_STORAGE_KEY,
  isPaidFunnelRawDiagnosticEvent,
  loadPaidFunnelEvents,
  PAID_FUNNEL_RAW_DIAGNOSTIC_EVENTS,
} from "../lib/experimentation/paidFunnelLocalStorage";
import { drainProductEventsForTests } from "../lib/experimentation/productEvents";
import { CreateUiStage } from "../components/agreements/createUiStage";
import { writeSigningPacketStatus } from "../vs01/vs01SigningPacketStatusStore";

/**
 * TEST578 — dashboard paid-create screen funnel telemetry.
 * Verifies runtime screen transitions emit product + local funnel events.
 */
describe("TEST578 dashboard paid-create screen funnel telemetry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    drainProductEventsForTests();
    clearLastLoggedDashboardPaidCreateScreenForTests();
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("localStorage", localStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveDashboardPaidCreateScreenForTelemetry maps generating intake to generating screen", () => {
    expect(
      resolveDashboardPaidCreateScreenForTelemetry({
        onDashboard: false,
        createUiStage: "draft" as never,
        displayPhase: "generating_draft",
        createFlowPhase: "generating_draft",
        premiumPostCheckoutPhase: "processing",
      }),
    ).toBe("generating");
  });

  it("logDashboardPaidCreateScreenTransition appends funnel row and product event", () => {
    logDashboardPaidCreateScreenTransition({
      screen: "review_validated",
      previousScreen: "generating",
      agreementId: "ag_test_578",
      sessionId: "sess_578",
    });

    const events = drainProductEventsForTests();
    expect(events.some((e) => e.name === "dashboard_paid_create_screen")).toBe(true);
    const payload = events.find((e) => e.name === "dashboard_paid_create_screen")?.payload;
    expect(payload?.screen).toBe("review_validated");
    expect(payload?.previous_screen).toBe("generating");

    const raw = localStorage.getItem(PAID_FUNNEL_EVENT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const rows = loadPaidFunnelEvents();
    expect(rows.some((r) => r.name === DASHBOARD_PAID_CREATE_SCREEN_FUNNEL_EVENT)).toBe(true);
    expect(rows.some((r) => r.render_source === "review_validated")).toBe(true);
  });

  it("resolveDashboardPaidCreateTelemetryLateScreens maps packet status to late screens", () => {
    writeSigningPacketStatus({
      agreementId: "ag_late_578",
      updatedAt: new Date().toISOString(),
      bySignerKey: { owner: "waiting", party_a: "waiting" },
      fullySigned: false,
    });
    expect(
      resolveDashboardPaidCreateTelemetryLateScreens({
        createUiStage: CreateUiStage.RECIPIENTS,
        agreementId: "ag_late_578",
      }),
    ).toEqual({ signatureLinksSent: true, completedProof: false });

    writeSigningPacketStatus({
      agreementId: "ag_proof_578",
      updatedAt: new Date().toISOString(),
      bySignerKey: { owner: "signed", party_a: "signed" },
      fullySigned: true,
    });
    expect(
      resolveDashboardPaidCreateTelemetryLateScreens({
        createUiStage: CreateUiStage.RECIPIENTS,
        agreementId: "ag_proof_578",
      }),
    ).toEqual({ signatureLinksSent: true, completedProof: true });
  });

  it("dashboard_paid_create_screen is classified raw-only diagnostic (not checkout funnel step)", () => {
    expect(isPaidFunnelRawDiagnosticEvent("dashboard_paid_create_screen")).toBe(true);
    expect(PAID_FUNNEL_RAW_DIAGNOSTIC_EVENTS).toContain("dashboard_paid_create_screen");
    expect(PAID_FUNNEL_RAW_DIAGNOSTIC_EVENTS).toContain("paid_create_submit_entitled_rewrite");
  });
});
