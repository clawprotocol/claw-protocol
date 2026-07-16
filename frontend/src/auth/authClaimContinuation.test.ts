/**
 * @vitest-environment jsdom
 *
 * Regression coverage for the email-claim continuation boundary:
 * auth-claim -> post-auth-return must preserve the exact active agreement and
 * return destination for BOTH email and Google, even when email routes through an
 * intermediate generic sign-in surface (/app/settings) before signInEmail runs.
 *
 * The test drives the real production functions along the exact call sequences of
 * ClaimRecordCard -> AccountLoginPanel -> AuthProvider.signIn* -> prepareAuthContinuation,
 * mocking only the two network calls so the server-continuation payload is observable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createServerAuthContinuation = vi.fn(async (args: unknown) => ({
  ok: true,
  continuation_id: "cont_test",
  expires_at: "2999-01-01T00:00:00Z",
  org_id: "anon-test",
  __args: args,
}));
const ensureAnonymousSession = vi.fn(async () => undefined);

vi.mock("./authContinuationApi", () => ({
  createServerAuthContinuation: (args: unknown) => createServerAuthContinuation(args),
}));
vi.mock("./anonymousSessionApi", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
  logAuthDiagnostic: () => undefined,
}));

import {
  captureContinuationFromLocation,
  createAuthContinuationContext,
  writeAuthContinuationContext,
  readAuthContinuationContext,
  clearAuthContinuationContext,
} from "./authContinuationContext";
import { prepareAuthContinuation } from "./prepareAuthContinuation";
import { resolvePostAuthDestination } from "./safeRedirectResolver";

type ServerPayload = { agreementId?: string; destinationPath?: string; workflowStage?: string };

function goTo(path: string): void {
  window.history.pushState({}, "", path);
}
function here(): string {
  return `${window.location.pathname}${window.location.search}`;
}
function lastServerPayload(): ServerPayload {
  const calls = createServerAuthContinuation.mock.calls;
  return (calls[calls.length - 1]?.[0] ?? {}) as ServerPayload;
}

// --- faithful mirrors of the real call sites (arg-for-arg) ---
function signInEmail(_email: string, opts?: { returningSignIn?: boolean }) {
  return prepareAuthContinuation({
    returningSignIn: opts?.returningSignIn,
    workflowStage: opts?.returningSignIn ? "dashboard" : "claim",
    destinationPath: opts?.returningSignIn ? "/app" : undefined,
    provider: "email",
  });
}
function signInGoogle(opts?: { returningSignIn?: boolean }) {
  return prepareAuthContinuation({
    returningSignIn: opts?.returningSignIn,
    workflowStage: opts?.returningSignIn ? "dashboard" : "claim",
    destinationPath: opts?.returningSignIn ? "/app" : undefined,
    provider: "google",
  });
}
/** ClaimRecordCard.handoffEmail (claim-auth path): capture, then navigate to /app/settings. */
function claimEmailHandoff(recordId: string) {
  captureContinuationFromLocation({ agreementId: recordId, workflowStage: "claim", destinationPath: here() });
  goTo("/app/settings");
}
/** ClaimRecordCard.handoffGoogle: capture, then signInGoogle immediately (no navigation). */
function claimGoogleHandoff(recordId: string) {
  captureContinuationFromLocation({ agreementId: recordId, workflowStage: "claim", destinationPath: here() });
  return signInGoogle();
}
/** AccountLoginPanel email submit. */
function accountLoginEmailSubmit(email: string) {
  captureContinuationFromLocation({ workflowStage: "settings", destinationPath: "/app" });
  return signInEmail(email);
}

beforeEach(() => {
  clearAuthContinuationContext();
  createServerAuthContinuation.mockClear();
  ensureAnonymousSession.mockClear();
  goTo("/");
});

describe("auth claim continuation — email boundary", () => {
  it("A. email claim from /app/done/AG-123 retains the agreement + returns to it", async () => {
    goTo("/app/done/AG-123");
    claimEmailHandoff("AG-123");
    await accountLoginEmailSubmit("owner@example.com");

    const ctx = readAuthContinuationContext();
    expect(ctx?.agreementId).toBe("AG-123");
    expect(ctx?.destinationPath).toBe("/app/done/AG-123");

    const srv = lastServerPayload();
    expect(srv.agreementId).toBe("AG-123");
    expect(srv.destinationPath).toBe("/app/done/AG-123");

    expect(resolvePostAuthDestination(ctx)).toBe("/app/done/AG-123");
  });

  it("B. email claim preserves the return query string", async () => {
    goTo("/app/done/AG-777?ref=partner&phase=review");
    claimEmailHandoff("AG-777");
    await accountLoginEmailSubmit("owner@example.com");

    const srv = lastServerPayload();
    expect(srv.agreementId).toBe("AG-777");
    expect(srv.destinationPath).toBe("/app/done/AG-777?ref=partner&phase=review");
  });

  it("C. Google claim from the same surface stays correct", async () => {
    goTo("/app/done/AG-123");
    await claimGoogleHandoff("AG-123");

    const srv = lastServerPayload();
    expect(srv.destinationPath).toBe("/app/done/AG-123");
    expect(srv.agreementId).toBe("AG-123");
    expect(resolvePostAuthDestination(readAuthContinuationContext())).toBe("/app/done/AG-123");
  });

  it("D. generic email sign-in from /app/settings stays generic and invents no agreementId", async () => {
    goTo("/app/settings");
    await accountLoginEmailSubmit("newuser@example.com");

    const srv = lastServerPayload();
    expect(srv.agreementId).toBeUndefined();
    expect(srv.destinationPath).toBe("/app/settings");
    expect(readAuthContinuationContext()?.agreementId).toBeUndefined();
  });

  it("E. a stale continuation from another agreement cannot override the current explicit claim", async () => {
    writeAuthContinuationContext(
      createAuthContinuationContext({
        agreementId: "AG-OLD",
        sourcePath: "/app/done/AG-OLD",
        destinationPath: "/app/done/AG-OLD",
        workflowStage: "claim",
      }),
    );

    goTo("/app/done/AG-NEW");
    claimEmailHandoff("AG-NEW");
    await accountLoginEmailSubmit("owner@example.com");

    const srv = lastServerPayload();
    expect(srv.agreementId).toBe("AG-NEW");
    expect(srv.destinationPath).toBe("/app/done/AG-NEW");
    expect(srv.agreementId).not.toBe("AG-OLD");
  });

  it("F. returning sign-in never adopts a stale claim continuation", async () => {
    writeAuthContinuationContext(
      createAuthContinuationContext({
        agreementId: "AG-OLD",
        sourcePath: "/app/done/AG-OLD",
        destinationPath: "/app/done/AG-OLD",
        workflowStage: "claim",
      }),
    );

    goTo("/sign-in");
    await signInEmail("returning@example.com", { returningSignIn: true });

    const srv = lastServerPayload();
    expect(srv.agreementId).toBeUndefined();
    expect(srv.destinationPath).toBe("/app");
  });
});
