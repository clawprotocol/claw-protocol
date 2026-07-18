/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { RecipientBootstrapBoundary } from "./RecipientBootstrapBoundary";
import { resetFragmentBootstrapExchangeForTests } from "./vs01FragmentBootstrapExchange";
import { resetRecipientSessionPacketLoadForTests } from "./recipientSessionPacketLoad";
import {
  resetFragmentBootstrapTokenMemoForTests,
  takeFragmentBootstrapTokenOnce,
} from "./vs01FragmentBootstrapToken";

const exchangeFetch = vi.fn();
const statusFetch = vi.fn();

describe("RecipientBootstrapBoundary StrictMode", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
    resetRecipientSessionPacketLoadForTests();
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
      if (url.includes("/api/recipient/session/packet")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            v: 1,
            document_label: "Mutual NDA",
            accepted_version_id: "av_test",
            accepted_corpus_sha256: "abc123def456",
            packet_revision: "rev1",
            signer_record_id: "signer:party_a:0",
            signer_role_id: "vs01r:test:i0:party_a",
            party_id: "party_a",
            signer_display_name: "Jane Signer",
            corpus_plain: "MUTUAL NDA AGREEMENT\n\n" + "Operative term. ".repeat(120),
            corpus_hash: "hash123",
            fields: [
              {
                id: "f1",
                type: "signature",
                page: 0,
                x: 0.1,
                y: 0.1,
                width: 0.2,
                height: 0.05,
              },
            ],
            page_count: 10,
            witness_page_index: 9,
            initials_policy: { enabled: false, bodyPagesOnly: true },
            readiness: "ready_for_review",
          }),
        });
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
    resetRecipientSessionPacketLoadForTests();
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
      expect(screen.getByTestId("recipient-session-packet-review")).toBeTruthy();
    });
    expect(screen.getByText("Signed in as")).toBeTruthy();
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
