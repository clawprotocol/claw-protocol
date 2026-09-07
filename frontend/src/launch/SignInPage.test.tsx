/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    sessionStorage.clear();
  });

  it("resumes the exact checkout destination after authentication", () => {
    const dest =
      "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate";
    navState.search = `?next=${encodeURIComponent(dest)}`;
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    expect(navState.navigate).toHaveBeenCalledWith(dest);
  });

  it("pins placeholder next to session persist and drops restore decoy", () => {
    const persistId = "d0e90b0c-f301-4b18-a755-dea64b4ac6cd";
    sessionStorage.setItem("claw_pre_auth_checkout_agreement_id_v1", persistId);
    const dest = `/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    navState.search = `?next=${encodeURIComponent(dest)}`;
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    expect(navState.navigate).toHaveBeenCalledWith(
      `/app/checkout/${persistId}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    sessionStorage.clear();
  });

  it("strips restore=starterReview from checkout next when persist exists", () => {
    const persistId = "e5a71257-87bb-47cc-aa03-63adf6b61089";
    const dest = `/app/checkout/${persistId}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    navState.search = `?next=${encodeURIComponent(dest)}`;
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    expect(navState.navigate).toHaveBeenCalledWith(
      `/app/checkout/${persistId}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
  });

  it("rejects unsafe external next destinations after authentication", () => {
    navState.search = "?next=https://evil.example";
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    expect(navState.navigate).toHaveBeenCalledWith("/app");
  });
});
