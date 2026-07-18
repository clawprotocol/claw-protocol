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
import { resetRecipientSessionPacketLoadForTests } from "./recipientSessionPacketLoad";

const exchangeFetch = vi.fn();
const statusFetch = vi.fn();
const packetFetch = vi.fn();
const publicPacketFetch = vi.fn();

const SAMPLE_PACKET = {
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
  signer_title: "Authorized Signer",
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
};

describe("RecipientBootstrapBoundary packet review", () => {
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
    packetFetch.mockReset();
    publicPacketFetch.mockReset();
    vi.spyOn(window.history, "replaceState");
    window.history.replaceState({}, "", "/app/esign/doc_abc?vs01_recipient_sign=1#t=packet-review-token");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (url.includes("/api/recipient/bootstrap/exchange")) {
        return exchangeFetch(url, init);
      }
      if (url.includes("/api/recipient/session/status")) {
        return statusFetch(url, init);
      }
      if (url.includes("/api/recipient/session/packet")) {
        return packetFetch(url, init);
      }
      if (url.includes("/vs01-signing-packet")) {
        return publicPacketFetch(url, init);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    statusFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authenticated: false, readiness: "unauthenticated" }),
    });
    packetFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_PACKET,
    });
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
    resetRecipientSessionPacketLoadForTests();
  });

  it("loads session-bound packet and renders read-only review without public fetch", async () => {
    render(
      <StrictMode>
        <RecipientBootstrapBoundary seedDocumentId="doc_abc" />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-packet-review")).toBeTruthy();
    });

    expect(packetFetch).toHaveBeenCalledTimes(1);
    expect(publicPacketFetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /finish signing/i })).toBeNull();
    expect(screen.getByText(/Signing will be enabled in a future update/i)).toBeTruthy();
  });

  it("applies deferred packet response after loading_packet transition", async () => {
    let resolveDeferred: ((value: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => {
      resolveDeferred = resolve;
    });
    packetFetch.mockReturnValue(deferred);

    render(<RecipientBootstrapBoundary />);

    await waitFor(() => {
      expect(screen.getByText(/Loading agreement for review/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-session-packet-review")).toBeNull();

    resolveDeferred?.({
      ok: true,
      json: async () => SAMPLE_PACKET,
    } as Response);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-packet-review")).toBeTruthy();
    });
    expect(packetFetch).toHaveBeenCalledTimes(1);
  });

  it("performs one logical packet load under StrictMode", async () => {
    render(
      <StrictMode>
        <RecipientBootstrapBoundary />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-packet-review")).toBeTruthy();
    });
    expect(packetFetch).toHaveBeenCalledTimes(1);
  });

  it("shows stale session when authority packet fetch fails", async () => {
    packetFetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        detail: {
          code: "bootstrap_invalid_or_expired",
          message: "This signing link is invalid, expired, or no longer available.",
        },
      }),
    });

    render(<RecipientBootstrapBoundary />);

    await waitFor(() => {
      expect(screen.getByText(/no longer valid/i)).toBeTruthy();
    });
    expect(publicPacketFetch).not.toHaveBeenCalled();
    expect(takeFragmentBootstrapTokenOnce()).toBeNull();
  });

  it("shows unavailable on network failure without rendering review UI", async () => {
    packetFetch.mockRejectedValue(new Error("network down"));

    render(<RecipientBootstrapBoundary />);

    await waitFor(() => {
      expect(screen.getByText(/could not load this agreement right now/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-session-packet-review")).toBeNull();
  });

  it("shows unavailable on malformed 200 packet without throwing", async () => {
    packetFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, v: 1, readiness: "ready_for_review" }),
    });

    render(<RecipientBootstrapBoundary />);

    await waitFor(() => {
      expect(screen.getByText(/could not load this agreement right now/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-session-packet-review")).toBeNull();
  });
});
