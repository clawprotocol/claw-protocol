/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { SignInPage } from "./SignInPage";
import { AUTH_EMAIL_FAILED_COPY, AUTH_EMAIL_SENT_COPY } from "../auth/authUserFacingCopy";

const navState = {
  search: "",
  navigate: vi.fn(),
};

const authState: {
  user: { id: string } | null;
  signInEmail: ReturnType<typeof vi.fn>;
} = {
  user: null,
  signInEmail: vi.fn(),
};

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => navState,
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    enabled: true,
    loading: false,
    user: authState.user,
    signInEmail: authState.signInEmail,
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
  beforeEach(() => {
    cleanup();
    navState.search = "";
    navState.navigate = vi.fn();
    authState.user = null;
    authState.signInEmail = vi.fn();
  });

  it("resumes the exact checkout destination after authentication", async () => {
    const dest =
      "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate";
    navState.search = `?next=${encodeURIComponent(dest)}`;
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    const { getByTestId } = render(<SignInPage />);
    expect(getByTestId("auth-sign-in-continuing")).toBeTruthy();
    await waitFor(() => expect(navState.navigate).toHaveBeenCalledWith(dest));
  });

  it("rejects unsafe external next destinations after authentication", async () => {
    navState.search = "?next=https://evil.example";
    navState.navigate = vi.fn();
    authState.user = { id: "user-1" };
    render(<SignInPage />);
    await waitFor(() => expect(navState.navigate).toHaveBeenCalledWith("/app"));
  });

  it("shows generic success and stays single-submit after email send", async () => {
    navState.search = "";
    navState.navigate = vi.fn();
    authState.user = null;
    authState.signInEmail = vi.fn().mockResolvedValue({ mode: "email_sent" });
    const { getByTestId } = render(<SignInPage />);
    fireEvent.change(getByTestId("auth-sign-in-email"), { target: { value: "owner@example.com" } });
    fireEvent.submit(getByTestId("auth-sign-in-submit").closest("form") as HTMLFormElement);
    await waitFor(() => expect(getByTestId("auth-sign-in-status").textContent).toBe(AUTH_EMAIL_SENT_COPY));
    expect(authState.signInEmail).toHaveBeenCalledTimes(1);
    expect((getByTestId("auth-sign-in-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(getByTestId("auth-sign-in-submit").closest("form") as HTMLFormElement);
    expect(authState.signInEmail).toHaveBeenCalledTimes(1);
  });

  it("sanitizes provider failures without account-existence copy", async () => {
    navState.search = "";
    navState.navigate = vi.fn();
    authState.user = null;
    authState.signInEmail = vi.fn().mockRejectedValue(new Error("User not found"));
    const { getByTestId, queryByText } = render(<SignInPage />);
    fireEvent.change(getByTestId("auth-sign-in-email"), { target: { value: "owner@example.com" } });
    fireEvent.submit(getByTestId("auth-sign-in-submit").closest("form") as HTMLFormElement);
    await waitFor(() => expect(getByTestId("auth-sign-in-status").textContent).toBe(AUTH_EMAIL_FAILED_COPY));
    expect(queryByText("User not found")).toBeNull();
  });
});
