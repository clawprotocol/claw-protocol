/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrgId, setOrgId, subscribeToOrgContextChanges } from "./orgContext";

describe("workspace organization lifecycle", () => {
  afterEach(() => localStorage.clear());

  it("notifies the mounted application when the server-bound workspace changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToOrgContextChanges(listener);

    setOrgId("user-account-one");
    expect(getOrgId()).toBe("user-account-one");
    expect(listener).toHaveBeenCalledWith("user-account-one");

    unsubscribe();
    setOrgId("user-account-two");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns to an unbound workspace state when the user session is cleared", () => {
    setOrgId("user-account-one");
    setOrgId("");
    expect(getOrgId()).toBe("local-org");
  });
});
