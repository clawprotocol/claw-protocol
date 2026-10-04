/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import { AUTH_UNAVAILABLE_COPY } from "./authUserFacingCopy";

const authListeners: Array<(session: Session | null) => void> = [];

const mockUser = {
  id: "returning-owner",
  email: "owner@example.test",
  user_metadata: { full_name: "Returning Owner" },
} as unknown as User;

const mockSession = {
  user: mockUser,
  access_token: "test-access-token",
} as Session;

const getAuthSession = vi.fn(async () => mockSession);
const finalizeAuthenticatedSession = vi.fn(async () => ({
  destinationPath: "/app",
  orgId: "user-returning-owner",
  migratedAgreementCount: 0,
  migratedAgreementIds: [],
  usedContinuation: true,
  usedFallback: false,
}));

vi.mock("./supabaseAuthService", () => ({
  getAuthSession: () => getAuthSession(),
  isSupabaseAuthEnabled: () => true,
  onAuthStateChange: (listener: (session: Session | null) => void) => {
    authListeners.push(listener);
    return { unsubscribe: () => undefined };
  },
  signInWithEmailMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutAuth: vi.fn(async () => undefined),
  buildAuthCallbackUrl: vi.fn(),
  resolveBrowserAuthSession: (session: Session | null) => session,
}));

vi.mock("./postAuthFinalizer", () => ({
  displayNameFromUser: () => "Returning Owner",
  finalizeAuthenticatedSession: (...args: unknown[]) => finalizeAuthenticatedSession(...args),
}));

vi.mock("./workspaceBindingApi", () => ({
  bindAuthenticatedUserToWorkspace: vi.fn(),
}));

vi.mock("./prepareAuthContinuation", () => ({
  prepareAuthContinuation: vi.fn(),
}));

vi.mock("./authAccessTokenCache", () => ({
  setCachedAccessToken: vi.fn(),
  clearCachedAccessToken: vi.fn(),
}));

vi.mock("../launch/genesisReferral/genesisDogOnboardingCapture", () => ({
  GENESIS_DOG_ONBOARDING_DESTINATION: "/app?join=genesis-dogs",
  hasGenesisDogOnboardingIntent: () => false,
}));

vi.mock("./e2eAuthSessionBridge", () => ({
  readE2eAuthSessionForDev: () => null,
}));

vi.mock("./authContinuationApi", () => ({
  readContinuationId: () => "continuation-returning",
}));

import { AuthProvider } from "./AuthProvider";
import { clearCompletedAuthFinalize } from "./returningFinalizeLatch";

describe("returning auth finalization latch", () => {
  beforeEach(() => {
    cleanup();
    sessionStorage.clear();
    authListeners.length = 0;
    finalizeAuthenticatedSession.mockClear();
    getAuthSession.mockClear();
    clearCompletedAuthFinalize();
  });

  it("finalizes a returning no-op once across auth events and a remount", async () => {
    const first = render(
      <AuthProvider>
        <div>dashboard</div>
      </AuthProvider>,
    );
    await waitFor(() => expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 4; i += 1) {
      for (const listener of authListeners) listener(mockSession);
    }
    first.unmount();
    authListeners.length = 0;
    render(
      <AuthProvider>
        <div>dashboard</div>
      </AuthProvider>,
    );

    await waitFor(() => expect(getAuthSession.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1);
    const stored = sessionStorage.getItem("lawdog_auth_finalize_latch_v1") || "";
    expect(stored).not.toContain("test-access-token");
    expect(stored).not.toContain("claw_anon_session");
    expect(AUTH_UNAVAILABLE_COPY).not.toContain("test-access-token");
  });

  it("still retries a genuine finalization rejection on the next mount", async () => {
    finalizeAuthenticatedSession.mockRejectedValue(new Error("anonymous_session_consumed"));
    const first = render(
      <AuthProvider>
        <div>dashboard</div>
      </AuthProvider>,
    );
    await waitFor(() => expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1));
    first.unmount();
    authListeners.length = 0;
    render(
      <AuthProvider>
        <div>dashboard</div>
      </AuthProvider>,
    );
    await waitFor(() => expect(getAuthSession.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem("lawdog_auth_finalize_latch_v1")).toBeNull();
  });
});
