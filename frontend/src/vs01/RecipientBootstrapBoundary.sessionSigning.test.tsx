/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const lifecycleMocks = vi.hoisted(() => {
  const mutationCalls: Array<{ fieldId: string; value: string; mutationId: string }> = [];
  let fieldAttempts = 0;
  let completeAttempts = 0;

  function resetLifecycleMocks() {
    mutationCalls.length = 0;
    fieldAttempts = 0;
    completeAttempts = 0;
  }

  function mutationOk(fieldId: string, value: string) {
    return {
      ok: true as const,
      field_id: fieldId,
      idempotent: false,
      field_values: { [fieldId]: value },
      field_revisions: { [fieldId]: 1 },
      readiness: "ready_for_signing" as const,
      signer_complete: false,
      finish_ready: true,
      required_field_count: 1,
      completed_field_count: 1,
      missing_field_ids: [] as string[],
    };
  }

  return {
    mutationCalls,
    resetLifecycleMocks,
    getFieldAttempts: () => fieldAttempts,
    getCompleteAttempts: () => completeAttempts,
    mutateRecipientSessionFieldOnce: vi.fn(
      async (fieldId: string, value: string, _expectedRevision: number, mutationId: string) => {
        mutationCalls.push({ fieldId, value, mutationId });
        fieldAttempts += 1;
        if (fieldAttempts === 1) {
          return {
            ok: false as const,
            code: "network_error",
            message: "network down",
            kind: "network" as const,
          };
        }
        return mutationOk(fieldId, value);
      },
    ),
    completeRecipientSessionSigner: vi.fn(async () => {
      completeAttempts += 1;
      return {
        ok: true as const,
        signer_complete: true,
        idempotent: false,
        globally_executed: false as const,
        readiness: "signer_complete" as const,
        finish_ready: true,
        required_field_count: 1,
        completed_field_count: 1,
        missing_field_ids: [] as string[],
      };
    }),
  };
});

vi.mock("./recipientSessionSigningApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recipientSessionSigningApi")>();
  return {
    ...actual,
    mutateRecipientSessionFieldOnce: lifecycleMocks.mutateRecipientSessionFieldOnce,
    completeRecipientSessionSigner: lifecycleMocks.completeRecipientSessionSigner,
  };
});

import { RecipientBootstrapBoundary } from "./RecipientBootstrapBoundary";
import type { RecipientSessionPacketProjection } from "./recipientSessionPacketApi";
import { resetFragmentBootstrapExchangeForTests } from "./vs01FragmentBootstrapExchange";
import { resetFragmentBootstrapTokenMemoForTests } from "./vs01FragmentBootstrapToken";
import { resetRecipientSessionPacketLoadForTests } from "./recipientSessionPacketLoad";
import { resetRecipientSessionSigningInFlightForTests } from "./recipientSessionSigningApi";
import { setRecipientSessionDiagnosticsSuppressed } from "./vs01SignerFieldAssignment";

const exchangeFetch = vi.fn();
const packetFetch = vi.fn();
const logoutFetch = vi.fn();

const SENSITIVE_MARKERS = [
  "party_a",
  "signer:party_a",
  "vs01r:test",
  "signing-token",
  "hash123",
  "abc123def456",
  "mut-",
  "doc_abc",
];

const SAMPLE_PACKET: RecipientSessionPacketProjection = {
  ok: true,
  v: 1,
  document_id: "doc_abc",
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
      type: "signature" as const,
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
  readiness: "ready_for_signing",
  signer_complete: false,
  finish_ready: false,
  field_values: {},
  field_revisions: { f1: 0 },
};

function installThrowingStorageSpies() {
  const localGet = vi.spyOn(window.localStorage, "getItem");
  const localSet = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
    throw new Error("localStorage.setItem is forbidden in session signing");
  });
  const sessionGet = vi.spyOn(window.sessionStorage, "getItem");
  const sessionSet = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
    throw new Error("sessionStorage.setItem is forbidden in session signing");
  });
  return { localGet, localSet, sessionGet, sessionSet };
}

function installConsoleGuards() {
  const methods = ["log", "info", "warn", "error"] as const;
  return Object.fromEntries(
    methods.map((method) => [
      method,
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        const text = args
          .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
          .join(" ");
        for (const marker of SENSITIVE_MARKERS) {
          if (text.includes(marker)) {
            throw new Error(`Sensitive console output detected (${method}): ${marker}`);
          }
        }
      }),
    ]),
  ) as Record<(typeof methods)[number], ReturnType<typeof vi.spyOn>>;
}

describe("RecipientBootstrapBoundary session signing", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
    resetRecipientSessionPacketLoadForTests();
    resetRecipientSessionSigningInFlightForTests();
    setRecipientSessionDiagnosticsSuppressed(false);
    lifecycleMocks.resetLifecycleMocks();
    lifecycleMocks.mutateRecipientSessionFieldOnce.mockClear();
    lifecycleMocks.completeRecipientSessionSigner.mockClear();
    exchangeFetch.mockReset();
    packetFetch.mockReset();
    logoutFetch.mockReset();
    vi.spyOn(window.history, "replaceState");
    window.history.replaceState({}, "", "/app/esign/doc_abc?vs01_recipient_sign=1#t=signing-token");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (url.includes("/api/recipient/bootstrap/exchange")) return exchangeFetch(url, init);
      if (url.includes("/api/recipient/session/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, authenticated: false, readiness: "unauthenticated" }),
        });
      }
      if (url.includes("/api/recipient/session/packet")) return packetFetch(url, init);
      if (url.includes("/api/recipient/session/logout")) return logoutFetch(url, init);
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    packetFetch.mockResolvedValue({ ok: true, json: async () => SAMPLE_PACKET });
    exchangeFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        authenticated: true,
        readiness: "session_established",
        signer_display_name: "Jane Signer",
        document_label: "Mutual NDA",
      }),
    });
    logoutFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authenticated: false, readiness: "signed_out" }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
    resetRecipientSessionPacketLoadForTests();
    resetRecipientSessionSigningInFlightForTests();
    setRecipientSessionDiagnosticsSuppressed(false);
  });

  it("renders session signing panel from session packet without public fetch", async () => {
    const spies = installThrowingStorageSpies();
    const consoleGuards = installConsoleGuards();
    render(
      <StrictMode>
        <RecipientBootstrapBoundary seedDocumentId="doc_abc" />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-signing-panel")).toBeTruthy();
    });
    expect(packetFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /finish signing/i })).toBeTruthy();
    expect(spies.localSet).not.toHaveBeenCalled();
    expect(spies.sessionSet).not.toHaveBeenCalled();
    expect(consoleGuards.error).not.toHaveBeenCalled();
    expect(window.location.href).not.toMatch(/corpus|token|secret/i);
  });

  it("panel routes signature input to session field mutation API", async () => {
    const { adaptRecipientSessionPacketProjection } = await import("./recipientSessionPacketAdapter");
    const { RecipientSessionSigningPanel } = await import("./RecipientSessionSigningPanel");
    const adapted = adaptRecipientSessionPacketProjection(SAMPLE_PACKET);
    expect(adapted).not.toBeNull();
    installConsoleGuards();
    render(
      <RecipientSessionSigningPanel
        packet={adapted!}
        onSignerComplete={() => {}}
        onStaleSession={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Signature"), { target: { value: "Jane Signer" } });
    await waitFor(() => {
      expect(lifecycleMocks.mutationCalls).toHaveLength(1);
    });
  });

  it("drives authenticated signing lifecycle with retry, completion, logout, and remount", async () => {
    const spies = installThrowingStorageSpies();
    installConsoleGuards();

    render(<RecipientBootstrapBoundary seedDocumentId="doc_abc" />);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-signing-panel")).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-session-signer-complete")).toBeNull();

    const signatureInput = await screen.findByLabelText("Signature");
    fireEvent.change(signatureInput, { target: { value: "Jane Signer" } });

    await waitFor(
      () => {
        expect(lifecycleMocks.mutationCalls).toHaveLength(1);
      },
      { timeout: 10000 },
    );
    expect(lifecycleMocks.mutationCalls[0]?.fieldId).toBe("f1");
    expect(lifecycleMocks.mutationCalls[0]?.value).toBe("Jane Signer");
    expect(screen.queryByTestId("recipient-session-signer-complete")).toBeNull();
    expect(lifecycleMocks.getCompleteAttempts()).toBe(0);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-signing-status")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry save/i }));

    await waitFor(
      () => {
        expect(lifecycleMocks.mutationCalls).toHaveLength(2);
      },
      { timeout: 10000 },
    );
    expect(lifecycleMocks.mutationCalls[1]?.mutationId).toBe(lifecycleMocks.mutationCalls[0]?.mutationId);
    expect(screen.queryByTestId("recipient-session-signer-complete")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /finish signing/i }));

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-session-signer-complete")).toBeTruthy();
      },
      { timeout: 10000 },
    );
    expect(lifecycleMocks.getCompleteAttempts()).toBe(1);
    expect(lifecycleMocks.getFieldAttempts()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => {
      expect(logoutFetch).toHaveBeenCalled();
      expect(screen.getByText(/signed out of this recipient session/i)).toBeTruthy();
    });

    cleanup();
    lifecycleMocks.resetLifecycleMocks();
    lifecycleMocks.mutateRecipientSessionFieldOnce.mockClear();
    lifecycleMocks.completeRecipientSessionSigner.mockClear();
    resetFragmentBootstrapTokenMemoForTests();
    resetFragmentBootstrapExchangeForTests();
    resetRecipientSessionPacketLoadForTests();
    window.history.replaceState({}, "", "/app/esign/doc_abc?vs01_recipient_sign=1");
    packetFetch.mockResolvedValue({ ok: true, json: async () => SAMPLE_PACKET });

    render(<RecipientBootstrapBoundary seedDocumentId="doc_abc" />);

    await waitFor(
      () => {
        expect(screen.queryByTestId("recipient-session-signing-panel")).toBeNull();
        expect(screen.queryByTestId("recipient-session-signer-complete")).toBeNull();
      },
      { timeout: 10000 },
    );
    expect(screen.queryByTestId("recipient-session-signing-panel")).toBeNull();
    expect(lifecycleMocks.mutationCalls).toHaveLength(0);
    expect(spies.localGet).not.toHaveBeenCalled();
    expect(spies.localSet).not.toHaveBeenCalled();
    expect(spies.sessionGet).not.toHaveBeenCalled();
    expect(spies.sessionSet).not.toHaveBeenCalled();
  }, 30000);

  it("survives Strict Mode remount without render loop warnings", async () => {
    const consoleGuards = installConsoleGuards();
    const { unmount } = render(
      <StrictMode>
        <RecipientBootstrapBoundary seedDocumentId="doc_abc" />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-signing-panel")).toBeTruthy();
    });
    unmount();
    render(
      <StrictMode>
        <RecipientBootstrapBoundary seedDocumentId="doc_abc" />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("recipient-session-signing-panel")).toBeTruthy();
    });
    const depthWarnings = consoleGuards.error.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth exceeded"),
    );
    const snapshotWarnings = consoleGuards.warn.mock.calls.filter((call) =>
      String(call[0]).includes("getSnapshot should be cached"),
    );
    expect(depthWarnings).toHaveLength(0);
    expect(snapshotWarnings).toHaveLength(0);
  });
});
