import { useEffect, useRef, useState } from "react";
import {
  fetchRecipientBootstrapSessionStatus,
  logoutRecipientBootstrapSession,
  type RecipientBootstrapExchangeResult,
  type RecipientBootstrapSessionStatus,
} from "./recipientBootstrapSessionApi";
import { RecipientSessionPacketReview } from "./RecipientSessionPacketReview";
import {
  adaptRecipientSessionPacketProjection,
  type AdaptedRecipientSessionPacket,
} from "./recipientSessionPacketAdapter";
import {
  beginRecipientSessionPacketLoad,
  invalidateRecipientSessionPacketLoads,
  isRecipientSessionPacketLoadCurrent,
} from "./recipientSessionPacketLoad";
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
  | "loading_packet"
  | "ready_for_review"
  | "stale_session"
  | "invalid_or_expired"
  | "already_used"
  | "unavailable"
  | "signed_out";

const GENERIC_LINK_MESSAGE =
  "This signing link is invalid, expired, or no longer available.";

const NETWORK_LOAD_MESSAGE =
  "We could not load this agreement right now. Check your connection and try again.";

type Props = {
  seedDocumentId?: string;
};

function applyExchangeResult(
  result: RecipientBootstrapExchangeResult,
  setStatus: (status: RecipientBootstrapSessionStatus | null) => void,
  setPacket: (packet: AdaptedRecipientSessionPacket | null) => void,
  setLoadTrigger: (value: number | ((prev: number) => number)) => void,
  setState: (state: RecipientBootstrapState) => void,
): void {
  if (result.ok) {
    setStatus(result.status);
    setPacket(null);
    setLoadTrigger((value) => value + 1);
    setState("loading_packet");
    return;
  }
  setState(result.code === "bootstrap_invalid_or_expired" ? "already_used" : "invalid_or_expired");
}

export function RecipientBootstrapBoundary(props: Props) {
  const [state, setState] = useState<RecipientBootstrapState>("checking");
  const [status, setStatus] = useState<RecipientBootstrapSessionStatus | null>(null);
  const [packet, setPacket] = useState<AdaptedRecipientSessionPacket | null>(null);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const loadTriggerRef = useRef(0);

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
        applyExchangeResult(result, setStatus, setPacket, setLoadTrigger, setState);
        return;
      }

      const inFlight = getFragmentBootstrapExchangePromise();
      if (inFlight) {
        setState("exchanging");
        const result = await inFlight;
        if (cancelled) {
          return;
        }
        applyExchangeResult(result, setStatus, setPacket, setLoadTrigger, setState);
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
          setPacket(null);
          setLoadTrigger((value) => value + 1);
          setState("loading_packet");
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

  useEffect(() => {
    if (loadTrigger === 0 || loadTrigger === loadTriggerRef.current) {
      return;
    }
    loadTriggerRef.current = loadTrigger;

    let alive = true;

    const { epoch, promise } = beginRecipientSessionPacketLoad();
    void promise
      .then((result) => {
        if (!alive || !isRecipientSessionPacketLoadCurrent(epoch)) {
          return;
        }
        if (!result.ok) {
          setStatus(null);
          setPacket(null);
          if (result.kind === "authority") {
            setState("stale_session");
            return;
          }
          setState("unavailable");
          return;
        }
        const adapted = adaptRecipientSessionPacketProjection(result.projection);
        if (!adapted) {
          setStatus(null);
          setPacket(null);
          setState("unavailable");
          return;
        }
        setPacket(adapted);
        setState("ready_for_review");
      })
      .catch(() => {
        if (!alive || !isRecipientSessionPacketLoadCurrent(epoch)) {
          return;
        }
        setStatus(null);
        setPacket(null);
        setState("unavailable");
      });

    return () => {
      alive = false;
    };
  }, [loadTrigger]);

  async function handleLogout() {
    invalidateRecipientSessionPacketLoads();
    loadTriggerRef.current = 0;
    setLoadTrigger(0);
    const next = await logoutRecipientBootstrapSession();
    setStatus(next);
    setPacket(null);
    setState("signed_out");
  }

  const title =
    state === "ready_for_review"
      ? "Agreement ready for review."
      : state === "loading_packet"
        ? "Loading agreement for review…"
        : state === "checking" || state === "exchanging"
          ? "Verifying your secure signing link…"
          : state === "signed_out"
            ? "You have signed out of this recipient session."
            : state === "unavailable"
              ? NETWORK_LOAD_MESSAGE
              : state === "stale_session"
                ? GENERIC_LINK_MESSAGE
                : GENERIC_LINK_MESSAGE;

  const subtitle =
    state === "loading_packet"
      ? "Loading your assigned agreement content…"
      : state === "ready_for_review"
        ? undefined
        : state === "stale_session"
          ? "Your session is no longer valid. Request a new signing link from the sender."
          : state === "unavailable"
            ? "You can reload this page to try again, or sign out and use a fresh signing link."
            : undefined;

  return (
    <div className="vs01-card vs01-card--envelope" data-testid="recipient-bootstrap-boundary">
      {state !== "ready_for_review" ? (
        <>
          <h2 className="vs01-card__title">{title}</h2>
          {subtitle ? <p className="vs01-card__subtitle">{subtitle}</p> : null}
        </>
      ) : null}

      {(state === "loading_packet" || state === "ready_for_review") && status ? (
        <div className="vs01-recipient-bootstrap-meta">
          <p>
            Signed in as <strong>{status.signer_display_name || "Recipient"}</strong>
          </p>
          {status.document_label ? <p>{status.document_label}</p> : null}
        </div>
      ) : null}

      {state === "ready_for_review" && packet ? <RecipientSessionPacketReview packet={packet} /> : null}

      {state === "ready_for_review" || state === "loading_packet" ? (
        <div className="vs01-recipient-bootstrap-meta">
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
