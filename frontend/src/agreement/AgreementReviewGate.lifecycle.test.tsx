/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgreementReviewGate } from "../ClawProductApp";
import {
  getReviewFragmentBootstrapMetadata,
  resetReviewFragmentBootstrapTokenMemoForTests,
  takeReviewFragmentBootstrapTokenOnce,
} from "./reviewFragmentBootstrapToken";
import {
  exchangeReviewFragmentBootstrapTokenOnce,
  getReviewFragmentBootstrapExchangePromise,
  resetReviewFragmentBootstrapExchangeForTests,
} from "./reviewFragmentBootstrapExchange";
import { fetchNegotiationReviewSessionStatus } from "./negotiationReviewSessionApi";

vi.mock("./AgreementRecipientReview", () => ({
  AgreementRecipientReview: (props: { negotiationReviewSessionAuth?: boolean }) => (
    <div
      data-testid="protected-review-ui"
      data-session-auth={props.negotiationReviewSessionAuth ? "1" : "0"}
    >
      review
    </div>
  ),
}));

vi.mock("./reviewFragmentBootstrapToken", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reviewFragmentBootstrapToken")>();
  return {
    ...actual,
    takeReviewFragmentBootstrapTokenOnce: vi.fn(actual.takeReviewFragmentBootstrapTokenOnce),
    getReviewFragmentBootstrapMetadata: vi.fn(actual.getReviewFragmentBootstrapMetadata),
  };
});

vi.mock("./reviewFragmentBootstrapExchange", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reviewFragmentBootstrapExchange")>();
  return {
    ...actual,
    exchangeReviewFragmentBootstrapTokenOnce: vi.fn(actual.exchangeReviewFragmentBootstrapTokenOnce),
    getReviewFragmentBootstrapExchangePromise: vi.fn(actual.getReviewFragmentBootstrapExchangePromise),
  };
});

vi.mock("./negotiationReviewSessionApi", () => ({
  fetchNegotiationReviewSessionStatus: vi.fn(),
}));

vi.mock("./recipientAccessApi", () => ({
  fetchRecipientAccessPolicy: vi.fn(async () => ({ review_anonymous_preview_allowed: false })),
  validateRecipientAccessToken: vi.fn(),
}));

vi.mock("./recipientReviewAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recipientReviewAuth")>();
  return {
    ...actual,
    invalidateNegotiationReviewSessionPresentation: vi.fn(actual.invalidateNegotiationReviewSessionPresentation),
    setNegotiationReviewSessionAuth: vi.fn(actual.setNegotiationReviewSessionAuth),
  };
});

const sessionOk = {
  ok: true,
  authenticated: true,
  agreement_id: "ag_gate",
  locked_version_id: "pre_lock",
  role: "reviewer",
  recipient_party_id: "p_r1",
  readiness: "ready",
} as const;

describe("AgreementReviewGate lifecycle", () => {
  afterEach(() => {
    cleanup();
    resetReviewFragmentBootstrapTokenMemoForTests();
    resetReviewFragmentBootstrapExchangeForTests();
    vi.clearAllMocks();
  });

  it("Strict Mode invokes exactly one exchange for one link", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue("frag-tok");
    vi.mocked(exchangeReviewFragmentBootstrapTokenOnce).mockResolvedValue({
      ok: true,
      status: sessionOk,
    });
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue({
      ok: true,
      authenticated: false,
      readiness: "no_session",
    });

    const { rerender } = render(
      <AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />,
    );
    rerender(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("protected-review-ui")).toBeTruthy();
    });
    expect(exchangeReviewFragmentBootstrapTokenOnce).toHaveBeenCalledTimes(1);
    expect(exchangeReviewFragmentBootstrapTokenOnce).toHaveBeenCalledWith("frag-tok", "ag_gate");
  });

  it("remount for the same link joins the correct exchange", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue(null);
    let resolveExchange!: (value: { ok: true; status: typeof sessionOk }) => void;
    const exchangePromise = new Promise<{ ok: true; status: typeof sessionOk }>((resolve) => {
      resolveExchange = resolve;
    });
    vi.mocked(getReviewFragmentBootstrapExchangePromise).mockReturnValue(exchangePromise);
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue({
      ok: true,
      authenticated: false,
      readiness: "no_session",
    });

    const { unmount } = render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);
    unmount();
    render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    resolveExchange({ ok: true, status: sessionOk });
    await waitFor(() => {
      expect(screen.getByTestId("protected-review-ui")).toBeTruthy();
    });
    expect(exchangeReviewFragmentBootstrapTokenOnce).not.toHaveBeenCalled();
    vi.mocked(getReviewFragmentBootstrapExchangePromise).mockReturnValue(null);
  });

  it("failed exchange never renders protected review UI", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue("bad-tok");
    vi.mocked(exchangeReviewFragmentBootstrapTokenOnce).mockResolvedValue({
      ok: false,
      code: "bootstrap_exchange_failed",
      message: "This link is invalid or expired. Request a new link from the sender.",
    });
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue({
      ok: true,
      authenticated: false,
      readiness: "no_session",
    });

    render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId("protected-review-ui")).toBeNull();
    });
    expect(screen.getByText(/invalid or expired/i)).toBeTruthy();
  });

  it("agreement route change resets gate before loading the next agreement", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue(null);
    vi.mocked(getReviewFragmentBootstrapMetadata).mockReturnValue({
      hadFragmentToken: false,
      fragmentRemoved: false,
      agreementIdFromPath: "ag_gate",
    });
    vi.mocked(fetchNegotiationReviewSessionStatus)
      .mockResolvedValueOnce({
        ok: true,
        authenticated: true,
        agreement_id: "ag_gate",
        locked_version_id: "pre_lock",
        role: "reviewer",
        recipient_party_id: "p_r1",
        readiness: "ready",
      })
      .mockResolvedValueOnce({
        ok: true,
        authenticated: false,
        readiness: "no_session",
      });

    const { rerender } = render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("protected-review-ui")).toBeTruthy();
    });

    rerender(<AgreementReviewGate key="ag_other" agreementId="ag_other" onClose={vi.fn()} />);
    expect(screen.getByText(/Validating link/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByTestId("protected-review-ui")).toBeNull();
    });
  });

  it("reload without a fragment uses cookie-session status", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue(null);
    vi.mocked(getReviewFragmentBootstrapMetadata).mockReturnValue({
      hadFragmentToken: false,
      fragmentRemoved: false,
      agreementIdFromPath: "ag_gate",
    });
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue(sessionOk);

    render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("protected-review-ui")).toBeTruthy();
    });
    expect(screen.getByTestId("protected-review-ui").getAttribute("data-session-auth")).toBe("1");
    expect(exchangeReviewFragmentBootstrapTokenOnce).not.toHaveBeenCalled();
  });

  it("wrong-agreement successful exchange fails closed", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue("frag-tok");
    vi.mocked(exchangeReviewFragmentBootstrapTokenOnce).mockResolvedValue({
      ok: true,
      status: { ...sessionOk, agreement_id: "ag_other" },
    });
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue({
      ok: true,
      authenticated: false,
      readiness: "no_session",
    });

    render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId("protected-review-ui")).toBeNull();
    });
    expect(screen.getByText(/invalid or expired/i)).toBeTruthy();
  });

  it("network rejection during fragment exchange fails closed without loading loop", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue("frag-tok");
    vi.mocked(exchangeReviewFragmentBootstrapTokenOnce).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue({
      ok: true,
      authenticated: false,
      readiness: "no_session",
    });

    render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Validating link/i)).toBeNull();
    });
    expect(screen.queryByTestId("protected-review-ui")).toBeNull();
    expect(screen.getByText(/invalid or expired/i)).toBeTruthy();
  });

  it("expired session fails closed for an authority-bound route", async () => {
    vi.mocked(takeReviewFragmentBootstrapTokenOnce).mockReturnValue(null);
    vi.mocked(getReviewFragmentBootstrapExchangePromise).mockReturnValue(null);
    vi.mocked(getReviewFragmentBootstrapMetadata).mockReturnValue({
      hadFragmentToken: false,
      fragmentRemoved: false,
      agreementIdFromPath: "ag_gate",
    });
    vi.mocked(fetchNegotiationReviewSessionStatus).mockResolvedValue({
      ok: true,
      authenticated: false,
      readiness: "session_invalid",
    });

    render(<AgreementReviewGate agreementId="ag_gate" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId("protected-review-ui")).toBeNull();
    });
    expect(screen.getByText(/invalid, expired, or no longer available/i)).toBeTruthy();
  });
});
