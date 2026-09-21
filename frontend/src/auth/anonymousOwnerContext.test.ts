/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAnonymousSession,
  readAnonymousSessionToken,
  writeAnonymousSession,
} from "./anonymousSessionApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { getOrgId, setOrgId } from "../launch/orgContext";

describe("anonymousSessionApi storage", () => {
  beforeEach(() => {
    clearAnonymousSession();
    setOrgId("");
  });

  it("stores token without exposing in org id", () => {
    writeAnonymousSession({
      orgId: "anon-abc123",
      sessionId: "sess-1",
      token: "opaque-token-value",
    });
    expect(getOrgId()).toBe("anon-abc123");
    expect(readAnonymousSessionToken()).toBe("opaque-token-value");
  });

  it("omits leftover anonymous session header on user workspaces", () => {
    writeAnonymousSession({
      orgId: "anon-abc123",
      sessionId: "sess-1",
      token: "opaque-token-value",
    });
    setOrgId("user-returning-buyer");
    const headers = clawAgreementHeaders() as Record<string, string>;
    expect(headers["X-Claw-Org-Id"]).toBe("user-returning-buyer");
    expect(headers["X-Claw-Anon-Session"]).toBeUndefined();
  });

  it("keeps anonymous session header on anon workspaces", () => {
    writeAnonymousSession({
      orgId: "anon-abc123",
      sessionId: "sess-1",
      token: "opaque-token-value",
    });
    const headers = clawAgreementHeaders() as Record<string, string>;
    expect(headers["X-Claw-Anon-Session"]).toBe("opaque-token-value");
  });

  it("does not clobber a server-authorized user workspace", () => {
    setOrgId("user-phase4b51-owner");
    writeAnonymousSession({
      orgId: "anon-must-not-win",
      sessionId: "sess-late",
      token: "late-anon-token",
    });
    expect(getOrgId()).toBe("user-phase4b51-owner");
  });

  it("clears stored anonymous session after sign-in finalize", () => {
    writeAnonymousSession({
      orgId: "anon-abc123",
      sessionId: "sess-1",
      token: "opaque-token-value",
    });
    clearAnonymousSession();
    expect(readAnonymousSessionToken()).toBeNull();
    const src = readFileSync(join(__dirname, "postAuthFinalizer.ts"), "utf8");
    expect(src).toContain("clearAnonymousSession()");
  });
});
