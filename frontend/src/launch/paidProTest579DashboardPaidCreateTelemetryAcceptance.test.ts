/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TEST579 — AgreementBuilderIntake DPC telemetry hook wiring + runtime acceptance pointers.
 * Runtime emission is proven by e2e/dashboard-paid-create-entitled.spec.ts (Playwright).
 */
describe("TEST579 dashboard paid-create telemetry acceptance", () => {
  const intakeSrc = readFileSync(
    join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );
  const e2eSrc = readFileSync(join(__dirname, "../../e2e/dashboard-paid-create-entitled.spec.ts"), "utf8");

  it("AgreementBuilderIntake wires useDashboardPaidCreateFunnelTelemetry when DPC marker active", () => {
    expect(intakeSrc).toContain("useDashboardPaidCreateFunnelTelemetry");
    expect(intakeSrc).toContain("enabled: isDashboardPaidCreateRouteActive()");
    expect(intakeSrc).toContain("onDashboard: false");
  });

  it("entitled dashboard Playwright spec asserts runtime dashboard_paid_create_screen events", () => {
    expect(e2eSrc).toContain("dashboard_paid_create_screen");
    expect(e2eSrc).toContain("dashboard_paid_create");
    expect(e2eSrc).toContain("funnelScreens");
    expect(e2eSrc).toContain('"dashboard"');
  });
});
