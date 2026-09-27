/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CreateFlowAgreementCheckoutPricing } from "./CreateFlowAgreementCheckoutPricing";
import { LAUNCH_PRICING_TIERS } from "../pricingTiersData";

const pro = LAUNCH_PRICING_TIERS.find((t) => t.id === "pro")!;

afterEach(() => cleanup());

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
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toMatch(/monthly/i);
    expect(tabs[1].textContent).toMatch(/annual/i);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("$49")).toBeTruthy();
    expect(screen.getByText("/month")).toBeTruthy();
    expect(screen.getByText("$490")).toBeTruthy();
    expect(screen.getByText("/year")).toBeTruthy();
  });
});
