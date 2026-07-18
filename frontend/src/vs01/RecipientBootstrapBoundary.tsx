import { useEffect, useState } from "react";
import {
  fetchRecipientBootstrapSessionStatus,
  logoutRecipientBootstrapSession,
  type RecipientBootstrapExchangeResult,
  type RecipientBootstrapSessionStatus,
} from "./recipientBootstrapSessionApi";
import {
  exchangeFragmentBootstrapTokenOnce,
  getFragmentBootstrapExchangePromise,
} from "./vs01FragmentBootstrapExchange";
import {
  getFragmentBootstrapMetadata,
  takeFragmentBootstrapTokenOnce,
} from "./vs01FragmentBootstrapToken";

export type RecipientBootstrapState =
  | "checking"
  | "exchanging"
  | "authenticated"
  | "invalid_or_expired"
  | "already_used"
  | "unavailable"
  | "signed_out";

const GENERIC_LINK_MESSAGE =
  "This signing link is invalid, expired, or no longer available.";

type Props = {
  seedDocumentId?: string;
};

function applyExchangeResult(
  result: RecipientBootstrapExchangeResult,
  setStatus: (status: RecipientBootstrapSessionStatus | null) => void,
  setState: (state: RecipientBootstrapState) => void,
): void {
  if (result.ok) {
    setStatus(result.status);
    setState("authenticated");
    return;
  }
  setState(result.code === "bootstrap_invalid_or_expired" ? "already_used" : "invalid_or_expired");
}

export function RecipientBootstrapBoundary(props: Props) {
  const [state, setState] = useState<RecipientBootstrapState>("checking");
  const [status, setStatus] = useState<RecipientBootstrapSessionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = takeFragmentBootstrapTokenOnce();
      if (token) {
        setState("exchanging");
        const result = await exchangeFragmentBootstrapTokenOnce(token);
        if (cancelled) {
          return;
        }
        applyExchangeResult(result, setStatus, setState);
        return;
      }

      const inFlight = getFragmentBootstrapExchangePromise();
      if (inFlight) {
        setState("exchanging");
        const result = await inFlight;
        if (cancelled) {
          return;
        }
        applyExchangeResult(result, setStatus, setState);
        return;
      }

      const meta = getFragmentBootstrapMetadata();
      if (meta?.hadFragmentToken) {
        setState("invalid_or_expired");
        return;
      }

      setState("checking");
      try {
        const current = await fetchRecipientBootstrapSessionStatus();
        if (cancelled) {
          return;
        }
        if (current.authenticated) {
          setStatus(current);
          setState("authenticated");
          return;
        }
        setState("signed_out");
      } catch {
        if (!cancelled) {
          setState("unavailable");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    const next = await logoutRecipientBootstrapSession();
    setStatus(next);
    setState("signed_out");
  }

  const title =
    state === "authenticated"
      ? "Secure recipient session established."
      : state === "checking" || state === "exchanging"
        ? "Verifying your secure signing link…"
        : state === "signed_out"
          ? "You have signed out of this recipient session."
          : GENERIC_LINK_MESSAGE;

  const subtitle =
    state === "authenticated"
      ? "Your session is active. Agreement signing will be available in a future update."
      : undefined;

  return (
    <div className="vs01-card vs01-card--envelope" data-testid="recipient-bootstrap-boundary">
      <h2 className="vs01-card__title">{title}</h2>
      {subtitle ? <p className="vs01-card__subtitle">{subtitle}</p> : null}
      {state === "authenticated" && status ? (
        <div className="vs01-recipient-bootstrap-meta">
          <p>
            Signed in as <strong>{status.signer_display_name || "Recipient"}</strong>
          </p>
          {status.document_label ? <p>{status.document_label}</p> : null}
          <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => void handleLogout()}>
            Sign out
          </button>
        </div>
      ) : null}
      {props.seedDocumentId ? (
        <span data-testid="recipient-bootstrap-doc-id" hidden>
          {props.seedDocumentId}
        </span>
      ) : null}
    </div>
  );
}
