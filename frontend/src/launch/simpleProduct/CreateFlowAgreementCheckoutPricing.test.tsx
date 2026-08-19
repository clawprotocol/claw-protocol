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
});
