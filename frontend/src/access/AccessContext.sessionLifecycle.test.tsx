/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  auth: {
    enabled: true,
    loading: true,
    user: null as { id: string } | null,
    session: null as { access_token?: string } | null,
  },
  orgId: "user-one",
  subscriptionTier: null as "premium" | null,
  orgListener: null as ((orgId: string) => void) | null,
  entitlementListener: null as (() => void) | null,
  refresh: vi.fn(async () => null),
  clear: vi.fn(),
}));

vi.mock("../auth/AuthProvider", () => ({ useAuth: () => lifecycle.auth }));
vi.mock("../config/featureFlags", () => ({ featureFlags: { serverBilling: true } }));
vi.mock("../launch/orgContext", () => ({
  getOrgId: () => lifecycle.orgId,
  subscribeToOrgContextChanges: (listener: (orgId: string) => void) => {
    lifecycle.orgListener = listener;
    return () => {
      lifecycle.orgListener = null;
    };
  },
}));
vi.mock("./subscriptionEntitlementCache", () => ({
  refreshSubscriptionEntitlement: lifecycle.refresh,
  clearCachedSubscriptionEntitlement: lifecycle.clear,
  subscriptionTierForAccess: () => lifecycle.subscriptionTier,
  subscribeToSubscriptionEntitlementChanges: (listener: () => void) => {
    lifecycle.entitlementListener = listener;
    return () => {
      lifecycle.entitlementListener = null;
    };
  },
}));

import { AccessProvider, useAccess } from "./AccessContext";

function CurrentTier() {
  return <div data-testid="tier">{useAccess().tier}</div>;
}

describe("AccessProvider session lifecycle", () => {
  beforeEach(() => {
    lifecycle.auth.enabled = true;
    lifecycle.auth.loading = true;
    lifecycle.auth.user = null;
    lifecycle.auth.session = null;
    lifecycle.orgId = "user-one";
    lifecycle.subscriptionTier = null;
    lifecycle.orgListener = null;
    lifecycle.entitlementListener = null;
    lifecycle.refresh.mockClear();
    lifecycle.clear.mockClear();
  });

  afterEach(() => cleanup());

  it("waits for auth, clears signed-out access, and refreshes for the validated user workspace", async () => {
    const { rerender } = render(
      <AccessProvider>
        <CurrentTier />
      </AccessProvider>,
    );
    expect(lifecycle.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("tier").textContent).toBe("free");

    lifecycle.auth.loading = false;
    rerender(
      <AccessProvider>
        <CurrentTier />
      </AccessProvider>,
    );
    await waitFor(() => expect(lifecycle.clear).toHaveBeenCalled());

    lifecycle.auth.user = { id: "account-one" };
    lifecycle.auth.session = { access_token: "token-one" };
    rerender(
      <AccessProvider>
        <CurrentTier />
      </AccessProvider>,
    );
    await waitFor(() => expect(lifecycle.refresh).toHaveBeenCalledWith("user-one"));
  });

  it("recomputes visible access immediately after checkout updates the entitlement", async () => {
    lifecycle.auth.loading = false;
    lifecycle.auth.user = { id: "account-one" };
    lifecycle.auth.session = { access_token: "token-one" };
    render(
      <AccessProvider>
        <CurrentTier />
      </AccessProvider>,
    );
    expect(screen.getByTestId("tier").textContent).toBe("free");

    lifecycle.subscriptionTier = "premium";
    act(() => lifecycle.entitlementListener?.());

    expect(screen.getByTestId("tier").textContent).toBe("premium");
  });
});
