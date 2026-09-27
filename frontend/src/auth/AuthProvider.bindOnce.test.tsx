/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";

const authListeners: Array<(session: Session | null) => void> = [];

const mockUser = {
  id: "supabase-user-already-bound",
  email: "bound@example.com",
  user_metadata: { full_name: "Bound User" },
} as unknown as User;

const mockSession = {
  user: mockUser,
  access_token: "test-access-token",
} as Session;

const getAuthSession = vi.fn(async () => mockSession);
const finalizeAuthenticatedSession = vi.fn(async (_args?: unknown) => ({
  destinationPath: "/app",
  migratedAgreementCount: 0,
  migratedAgreementIds: [],
  usedContinuation: false,
  usedFallback: true,
}));
const bindAuthenticatedUserToWorkspace = vi.fn(async (_args?: unknown) => ({
  ok: true,
  org_id: "user-supabase-user-already-bound",
  user_id: "supabase-user-already-bound",
  migrated_agreement_count: 0,
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
  signOutAuth: vi.fn(),
  buildAuthCallbackUrl: vi.fn(),
}));

vi.mock("./postAuthFinalizer", () => ({
  displayNameFromUser: () => "Bound User",
  finalizeAuthenticatedSession: (args: unknown) => finalizeAuthenticatedSession(args),
}));

vi.mock("./workspaceBindingApi", () => ({
  bindAuthenticatedUserToWorkspace: (args: unknown) => bindAuthenticatedUserToWorkspace(args),
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

import { AuthProvider, isAlreadyFinalizedWorkspaceUser } from "./AuthProvider";

describe("isAlreadyFinalizedWorkspaceUser", () => {
  it("is true only when the current user already finalized", () => {
    expect(isAlreadyFinalizedWorkspaceUser(null, "u1")).toBe(false);
    expect(isAlreadyFinalizedWorkspaceUser("u1", "u1")).toBe(true);
    expect(isAlreadyFinalizedWorkspaceUser("u1", "u2")).toBe(false);
    expect(isAlreadyFinalizedWorkspaceUser("u1", "")).toBe(false);
  });

  it("AuthProvider finalized-user path is a no-op (no bind POST)", () => {
    const src = readFileSync(join(__dirname, "AuthProvider.tsx"), "utf8");
    const start = src.indexOf("const finalizeUser = useCallback");
    const end = src.indexOf("useEffect(() => {", start);
    const block = src.slice(start, end);
    expect(block).toContain("isAlreadyFinalizedWorkspaceUser");
    expect(block).not.toContain("bindAuthenticatedUserToWorkspace");
    expect(block).toContain("finalizeAuthenticatedSession");
  });
});

describe("AuthProvider bind-once", () => {
  beforeEach(() => {
    authListeners.length = 0;
    getAuthSession.mockClear();
    finalizeAuthenticatedSession.mockClear();
    bindAuthenticatedUserToWorkspace.mockClear();
    finalizeAuthenticatedSession.mockImplementation(async () => ({
      destinationPath: "/app",
      migratedAgreementCount: 0,
      migratedAgreementIds: [],
      usedContinuation: false,
      usedFallback: true,
    }));
  });

  it("finalizes once then does not POST bind-user-org on later same-user auth events", async () => {
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1);
    });
    expect(finalizeAuthenticatedSession).toHaveBeenCalledWith({
      user: mockUser,
      claimMethod: "session_restore",
    });

    for (const listener of authListeners) {
      listener(mockSession);
      listener(mockSession);
    }

    await waitFor(() => {
      expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1);
    });
    expect(bindAuthenticatedUserToWorkspace).not.toHaveBeenCalled();
  });

  it("still runs first finalize bind for a new authenticated user", async () => {
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1);
    });
    expect(bindAuthenticatedUserToWorkspace).not.toHaveBeenCalled();
  });
});
