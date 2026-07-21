import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  authCallbackFinalizeKey,
  finalizeAuthenticatedSessionFromAuthCallback,
  resetAuthCallbackFinalizeDedupForTests,
} from "./authCallbackFinalizeDedup";
import type { PostAuthFinalizeResult } from "./postAuthFinalizer";

const mockUser = { id: "user-1", email: "u@example.com" } as User;

const mockResult: PostAuthFinalizeResult = {
  destinationPath: "/app/dashboard",
  migratedAgreementCount: 1,
  migratedAgreementIds: ["ag-1"],
  usedContinuation: true,
  usedFallback: false,
};

vi.mock("./postAuthFinalizer", () => ({
  finalizeAuthenticatedSession: vi.fn(async () => mockResult),
}));

import { finalizeAuthenticatedSession } from "./postAuthFinalizer";

describe("authCallbackFinalizeDedup", () => {
  beforeEach(() => {
    resetAuthCallbackFinalizeDedupForTests();
    vi.mocked(finalizeAuthenticatedSession).mockClear();
  });

  it("builds stable keys per user and continuation", () => {
    expect(authCallbackFinalizeKey({ userId: "u1", continuationId: "c1" })).toBe("u1:c1");
    expect(authCallbackFinalizeKey({ userId: "u1", continuationId: null })).toBe("u1:__no_continuation__");
  });

  it("dedupes concurrent calls with the same continuation key", async () => {
    const p1 = finalizeAuthenticatedSessionFromAuthCallback({
      user: mockUser,
      claimMethod: "magic_link",
      continuationId: "cont-1",
    });
    const p2 = finalizeAuthenticatedSessionFromAuthCallback({
      user: mockUser,
      claimMethod: "magic_link",
      continuationId: "cont-1",
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(mockResult);
    expect(r2).toEqual(mockResult);
    expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(1);
  });

  it("allows a new call after the prior promise settles", async () => {
    await finalizeAuthenticatedSessionFromAuthCallback({
      user: mockUser,
      claimMethod: "magic_link",
      continuationId: "cont-2",
    });
    await finalizeAuthenticatedSessionFromAuthCallback({
      user: mockUser,
      claimMethod: "magic_link",
      continuationId: "cont-2",
    });
    expect(finalizeAuthenticatedSession).toHaveBeenCalledTimes(2);
  });
});
