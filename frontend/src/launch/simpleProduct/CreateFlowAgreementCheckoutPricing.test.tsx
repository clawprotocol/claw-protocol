/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreateFlowAgreementCheckoutPricing } from "./CreateFlowAgreementCheckoutPricing";
import { LAUNCH_PRICING_TIERS } from "../pricingTiersData";

const pro = LAUNCH_PRICING_TIERS.find((t) => t.id === "pro")!;

describe("CreateFlowAgreementCheckoutPricing", () => {
  it("states $490/year paid upfront and monthly finalized allowance", () => {
    render(
      <CreateFlowAgreementCheckoutPricing
        tier={pro}
        cadence="monthly"
        onCadenceChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/\$490\/year, paid upfront/i)).toBeTruthy();
    expect(screen.getAllByText(/Includes 10 finalized agreements each month/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Most popular/i)).toBeNull();
    expect(screen.queryByText(/120/i)).toBeNull();
  });

  it("shows both Monthly $49 and Annual $490 controls with monthly selected by default", () => {
    render(
      <CreateFlowAgreementCheckoutPricing
        tier={pro}
        cadence="monthly"
        onCadenceChange={vi.fn()}
      />,
    );
    const monthlyTab = screen.getByRole("tab", { name: /monthly/i });
    const annualTab = screen.getByRole("tab", { name: /annual/i });
    expect(monthlyTab.getAttribute("aria-selected")).toBe("true");
    expect(annualTab.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("$49")).toBeTruthy();
    expect(screen.getByText("/month")).toBeTruthy();
    expect(screen.getByText("$490")).toBeTruthy();
    expect(screen.getByText("/year")).toBeTruthy();
  });
});
