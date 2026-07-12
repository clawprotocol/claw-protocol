/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { resolveFrontendBuildIdentity } from "./frontendBuildMeta";

describe("resolveFrontendBuildIdentity", () => {
  it("prefers Railway git SHA and staging env labels", () => {
    expect(
      resolveFrontendBuildIdentity(
        {
          RAILWAY_GIT_COMMIT_SHA: "212d4729ba25b750094315c54c117afc5c1afb97",
          VITE_LAWDOG_ENV: "staging",
          VITE_CLAW_API_BASE: "https://claw-protocol-staging.up.railway.app",
        },
        { buildTimestamp: "2026-07-12T03:50:00.000Z" },
      ),
    ).toEqual({
      git_commit: "212d4729ba25b750094315c54c117afc5c1afb97",
      git_commit_short: "212d472",
      build_timestamp: "2026-07-12T03:50:00.000Z",
      environment: "staging",
      api_base: "https://claw-protocol-staging.up.railway.app",
    });
  });

  it("does not treat empty env values as enabled identity fields", () => {
    expect(
      resolveFrontendBuildIdentity({
        RAILWAY_GIT_COMMIT_SHA: "",
        VITE_LAWDOG_ENV: "",
        VITE_CLAW_API_BASE: "",
      }),
    ).toMatchObject({
      git_commit: "",
      git_commit_short: "",
      environment: "",
      api_base: "",
    });
  });
});

describe("frontendBuildIdentity embed", () => {
  it("exposes build identity constant at compile time", async () => {
    const mod = await import("./frontendBuildIdentity");
    const identity = mod.readFrontendBuildIdentity();
    expect(typeof identity.build_timestamp).toBe("string");
    expect(typeof identity.environment).toBe("string");
    expect(typeof identity.api_base).toBe("string");
  });
});
