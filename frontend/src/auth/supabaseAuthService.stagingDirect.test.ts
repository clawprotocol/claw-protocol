import { afterEach, describe, expect, it, vi } from "vitest";

const redirectViaStagingAuthMagicLink = vi.fn();
const signInWithOtp = vi.fn();

vi.mock("./stagingAuthMagicLink", () => ({
  isAuthEmailRateLimitError: () => false,
  isStagingAuthAllowlistedEmailClient: (email: string) =>
    email.toLowerCase().includes("cryptocurated21+"),
  isStagingAuthMagicLinkClientSurface: () => true,
  redirectViaStagingAuthMagicLink: (...args: unknown[]) => redirectViaStagingAuthMagicLink(...args),
}));

vi.mock("../lib/supabaseClient", () => ({
  isSupabaseBrowserConfigured: () => true,
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: async () => undefined,
    },
  }),
}));

describe("signInWithEmailMagicLink staging direct", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not fall through to OTP when staging mint fails", async () => {
    vi.stubEnv("VITE_CLAW_FEATURE_SUPABASE_AUTH", "1");
    redirectViaStagingAuthMagicLink.mockRejectedValueOnce(new Error("supabase_request_failed:ProxyError"));
    const { signInWithEmailMagicLink } = await import("./supabaseAuthService");
    await expect(
      signInWithEmailMagicLink("cryptocurated21+lawdogtest2@gmail.com", "https://staging.example/app/auth/callback"),
    ).rejects.toThrow(/supabase_request_failed/);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns staging_redirect when mint succeeds", async () => {
    vi.stubEnv("VITE_CLAW_FEATURE_SUPABASE_AUTH", "1");
    redirectViaStagingAuthMagicLink.mockResolvedValueOnce(undefined);
    const { signInWithEmailMagicLink } = await import("./supabaseAuthService");
    const result = await signInWithEmailMagicLink(
      "cryptocurated21+lawdogtest2@gmail.com",
      "https://staging.example/app/auth/callback",
      { stagingDirectOnly: true },
    );
    expect(result).toEqual({ mode: "staging_redirect" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
