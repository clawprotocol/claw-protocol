/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SignInPage } from "./SignInPage";

const navState = {
  search: "",
  navigate: vi.fn(),
};

const authState: { user: { id: string } | null } = { user: null };

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => navState,
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    enabled: true,
    loading: false,
    user: authState.user,
    signInEmail: vi.fn(),
    signInGoogle: vi.fn(),
  }),
}));

vi.mock("../auth/supabaseAuthService", () => ({
  isGoogleAuthConfigured: () => false,
}));

vi.mock("../auth/stagingAuthMagicLink", () => ({
  isStagingAuthMagicLinkClientSurface: () => false,
  stagingAuthDefaultTestEmail: () => "",
}));

describe("SignInPage checkout continuation", () => {
  it("resumes the exact checkout destination after authentication", () => {
    const dest =
      "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate";
    navState.search = `?next=${encodeURIComponent(dest)}`;
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    expect(navState.navigate).toHaveBeenCalledWith(dest);
  });

  it("rejects unsafe external next destinations after authentication", () => {
    navState.search = "?next=https://evil.example";
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    expect(navState.navigate).toHaveBeenCalledWith("/app");
  });
});
