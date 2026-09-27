/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrgId, setOrgId } from "../launch/orgContext";
import {
  bindAuthenticatedUserToWorkspace,
  resetWorkspaceBindInflightForTests,
} from "./workspaceBindingApi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("workspace bind in-flight owner", () => {
  beforeEach(() => {
    resetWorkspaceBindInflightForTests();
    setOrgId("anon-stale-resume");
  });

  afterEach(() => {
    resetWorkspaceBindInflightForTests();
    vi.unstubAllGlobals();
    try {
      localStorage.removeItem("claw_org_id");
    } catch {
      /* ignore */
    }
  });

  it("updates persisted org from a stale anonymous workspace after one successful bind", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        ok: true,
        org_id: "user-core-paid-owner",
        user_id: "core-paid-owner",
        migrated_agreement_count: 0,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const bound = await bindAuthenticatedUserToWorkspace({
      userId: "core-paid-owner",
      accessToken: "owner-token",
    });
    expect(bound.org_id).toBe("user-core-paid-owner");
    expect(getOrgId()).toBe("user-core-paid-owner");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("converges AuthProvider and create-page StrictMode duplicates onto one POST", async () => {
    let release!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = bindAuthenticatedUserToWorkspace({
      userId: "core-paid-owner",
      accessToken: "owner-token",
    });
    const second = bindAuthenticatedUserToWorkspace({
      userId: "core-paid-owner",
      accessToken: "owner-token",
    });
    const third = bindAuthenticatedUserToWorkspace({
      userId: "core-paid-owner",
      accessToken: "owner-token",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(
      jsonResponse({
        ok: true,
        org_id: "user-core-paid-owner",
        user_id: "core-paid-owner",
        migrated_agreement_count: 0,
      }),
    );
    const results = await Promise.all([first, second, third]);
    expect(results.map((row) => row.org_id)).toEqual([
      "user-core-paid-owner",
      "user-core-paid-owner",
      "user-core-paid-owner",
    ]);
    expect(getOrgId()).toBe("user-core-paid-owner");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a superseded bind and retries for the current user", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort);
        const body = String(init?.body || "");
        if (body.includes("other-user")) {
          queueMicrotask(() =>
            resolve(
              jsonResponse({
                ok: true,
                org_id: "user-other",
                user_id: "other-user",
                migrated_agreement_count: 0,
              }),
            ),
          );
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const stale = bindAuthenticatedUserToWorkspace({
      userId: "stale-user",
      accessToken: "stale-token",
    });
    await Promise.resolve();
    await Promise.resolve();
    const next = bindAuthenticatedUserToWorkspace({
      userId: "other-user",
      accessToken: "other-token",
    });
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    await expect(next).resolves.toMatchObject({ org_id: "user-other", user_id: "other-user" });
    expect(getOrgId()).toBe("user-other");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
