/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCallbackPage } from "./AuthCallbackPage";

const navState = {
  search: "",
  navigate: vi.fn(),
};

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => navState,
}));

vi.mock("../auth/supabaseAuthService", () => ({
  waitForAuthSession: vi.fn(),
}));

vi.mock("../auth/authCallbackFinalizeDedup", () => ({
  finalizeAuthenticatedSessionFromAuthCallback: vi.fn(),
}));

vi.mock("../auth/authContinuationApi", () => ({
  writeContinuationId: vi.fn(),
}));

vi.mock("../lib/experimentation/productEvents", () => ({
  logProductEvent: vi.fn(),
}));

vi.mock("../auth/workspaceBindingApi", () => ({
  bindAuthenticatedUserToWorkspace: vi.fn(),
}));

vi.mock("./orgContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./orgContext")>();
  return {
    ...actual,
    getOrgId: () => "user-phase4b5-owner",
  };
});

vi.mock("./simpleProduct/createWorkspaceProbeReadiness", () => ({
  isStaleAnonymousOrgId: () => false,
  isUserWorkspaceOrgId: () => true,
}));

import { waitForAuthSession } from "../auth/supabaseAuthService";
import { finalizeAuthenticatedSessionFromAuthCallback } from "../auth/authCallbackFinalizeDedup";

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    cleanup();
    navState.search = "";
    navState.navigate = vi.fn();
    vi.mocked(waitForAuthSession).mockReset();
    vi.mocked(finalizeAuthenticatedSessionFromAuthCallback).mockReset();
  });

  it("lets server continuation win over a forged next", async () => {
    navState.search = "?continuation_id=cont-1&next=/app.evil";
    vi.mocked(waitForAuthSession).mockResolvedValue({
      access_token: "tok",
      user: { id: "user-phase4b5-owner", email: "owner@example.com", app_metadata: { provider: "email" } },
    } as never);
    vi.mocked(finalizeAuthenticatedSessionFromAuthCallback).mockResolvedValue({
      destinationPath: "/app/create?agreementId=ag-phase4b5-orion",
      migratedAgreementCount: 1,
      migratedAgreementIds: ["ag-phase4b5-orion"],
      usedContinuation: true,
      usedFallback: false,
    });
    render(<AuthCallbackPage />);
    await waitFor(() =>
      expect(navState.navigate).toHaveBeenCalledWith("/app/create?agreementId=ag-phase4b5-orion"),
    );
    expect(navState.navigate).not.toHaveBeenCalledWith("/app.evil");
  });

  it("fails closed on a consumed continuation without following next", async () => {
    navState.search = "?continuation_id=cont-expired&next=/app/billing";
    vi.mocked(waitForAuthSession).mockResolvedValue({
      access_token: "tok",
      user: { id: "user-phase4b5-owner", email: "owner@example.com" },
    } as never);
    vi.mocked(finalizeAuthenticatedSessionFromAuthCallback).mockRejectedValue(new Error("continuation_expired"));
    const { getByTestId } = render(<AuthCallbackPage />);
    await waitFor(() => expect(getByTestId("auth-callback-unavailable")).toBeTruthy());
    expect(navState.navigate).not.toHaveBeenCalled();
  });
});
