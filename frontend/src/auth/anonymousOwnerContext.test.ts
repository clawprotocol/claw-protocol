/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { readAnonymousSessionToken, writeAnonymousSession } from "./anonymousSessionApi";
import { getOrgId } from "../launch/orgContext";

describe("anonymousSessionApi storage", () => {
  it("stores token without exposing in org id", () => {
    writeAnonymousSession({
      orgId: "anon-abc123",
      sessionId: "sess-1",
      token: "opaque-token-value",
    });
    expect(getOrgId()).toBe("anon-abc123");
    expect(readAnonymousSessionToken()).toBe("opaque-token-value");
  });
});
