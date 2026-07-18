/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { RecipientBootstrapBoundary } from "./RecipientBootstrapBoundary";
import { resetFragmentBootstrapExchangeForTests } from "./vs01FragmentBootstrapExchange";
import {
  resetFragmentBootstrapTokenMemoForTests,
  takeFragmentBootstrapTokenOnce,
} from "./vs01FragmentBootstrapToken";

const exchangeFetch = vi.fn();
const statusFetch = vi.fn();

describe("RecipientBootstrapBoundary StrictMode", () => {
  beforeEach(() => {
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
    exchangeFetch.mockReset();
    statusFetch.mockReset();
    vi.spyOn(window.history, "replaceState");
    window.history.replaceState({}, "", "/app/esign/doc_abc?vs01_recipient_sign=1#t=strict-mode-bootstrap-token");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (url.includes("/api/recipient/bootstrap/exchange")) {
        return exchangeFetch(url, init);
      }
      if (url.includes("/api/recipient/session/status")) {
        return statusFetch(url, init);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    statusFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authenticated: false, readiness: "unauthenticated" }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
  });

  it("performs one exchange and reaches authenticated UI under StrictMode", async () => {
    exchangeFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        authenticated: true,
        readiness: "session_established",
        signer_display_name: "Jane Signer",
        document_label: "Mutual NDA",
      }),
    }));

    render(
      <StrictMode>
        <RecipientBootstrapBoundary />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Secure recipient session established/i)).toBeTruthy();
    });
    expect(screen.getByText(/Jane Signer/)).toBeTruthy();
    expect(exchangeFetch).toHaveBeenCalledTimes(1);
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/app/esign/doc_abc?vs01_recipient_sign=1",
    );
    expect(takeFragmentBootstrapTokenOnce()).toBeNull();
    expect(screen.queryByText(/Verifying your secure signing link/i)).toBeNull();
  });

  it("performs one exchange and reaches failure UI under StrictMode", async () => {
    exchangeFetch.mockImplementation(async () => ({
      ok: false,
      json: async () => ({
        detail: {
          code: "bootstrap_invalid_or_expired",
          message: "This signing link is invalid, expired, or no longer available.",
        },
      }),
    }));

    render(
      <StrictMode>
        <RecipientBootstrapBoundary />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText(/invalid, expired, or no longer available/i)).toBeTruthy();
    });
    expect(exchangeFetch).toHaveBeenCalledTimes(1);
    expect(takeFragmentBootstrapTokenOnce()).toBeNull();
    expect(screen.queryByText(/Verifying your secure signing link/i)).toBeNull();
  });
});
