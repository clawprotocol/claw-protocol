/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../../components/agreements/agreementAdvancedDraftAccess";

const REAL_AGREEMENT_ID = "8f3a1c2e-4b5d-6789-abcd-ef0123456789";

const navState = {
  pathname: `/app/checkout/${REAL_AGREEMENT_ID}`,
  search: "?tier=pro&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview",
  hash: "",
  navigate: vi.fn(),
};

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => navState,
}));

vi.mock("./SimpleFlowShell", () => ({
  SimpleFlowShell: (props: { children: ReactNode; title: string }) => (
    <div>
      <h1>{props.title}</h1>
      {props.children}
    </div>
  ),
}));

import { SimpleCheckoutPage } from "./SimpleCheckoutPage";

function stubMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: true,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderRealIdCheckout(search: string): void {
  navState.pathname = `/app/checkout/${REAL_AGREEMENT_ID}`;
  navState.search = search;
  render(<SimpleCheckoutPage agreementId={REAL_AGREEMENT_ID} />);
}

describe("SimpleCheckoutPage create-flow chooser on real agreement ID", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    navState.navigate.mockClear();
    stubMatchMedia();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Monthly and Annual controls for a real persisted agreement ID", () => {
    renderRealIdCheckout("?tier=pro&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview");
    expect(screen.getByRole("tablist", { name: /billing cadence/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /monthly/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /annual/i })).toBeTruthy();
    expect(screen.getByText(/choose your plan/i)).toBeTruthy();
    expect(screen.queryByText(/activate your plan/i)).toBeNull();
    expect(navState.pathname).toBe(`/app/checkout/${REAL_AGREEMENT_ID}`);
    expect(navState.pathname).not.toContain(CREATE_FLOW_CHECKOUT_AGREEMENT_ID);
  });

  it("defaults to $49/month when cadence is omitted", () => {
    renderRealIdCheckout("?tier=pro&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview");
    expect(screen.getByRole("tab", { name: /monthly/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /annual/i }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("$49")).toBeTruthy();
    expect(screen.getByText("/month")).toBeTruthy();
    expect(screen.getAllByText(/\$49 \/ month/).length).toBeGreaterThanOrEqual(1);
  });

  it("defaults to $49/month when cadence=monthly", () => {
    renderRealIdCheckout("?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview");
    expect(screen.getByRole("tab", { name: /monthly/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText(/\$49 \/ month/).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps Annual selectable and shows $490/year", async () => {
    const user = userEvent.setup();
    renderRealIdCheckout("?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview");
    expect(screen.getByText("$490")).toBeTruthy();
    expect(screen.getByText("/year")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: /annual/i }));
    expect(screen.getByRole("tab", { name: /annual/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText(/\$490 \/ year/).length).toBeGreaterThanOrEqual(1);
  });

  it("does not fall back to the placeholder create-checkout id", () => {
    renderRealIdCheckout("?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview");
    expect(screen.queryByText(CREATE_FLOW_CHECKOUT_AGREEMENT_ID)).toBeNull();
    expect(navState.pathname).toBe(`/app/checkout/${REAL_AGREEMENT_ID}`);
  });
});
