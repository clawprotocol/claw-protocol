import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import type { AdaptedRecipientSessionPacket } from "./recipientSessionPacketAdapter";
import { RecipientSigningView } from "./RecipientSigningView";
import type { Vs01RecipientPlacedField } from "./types";
import {
  RecipientSessionFieldMutationCoordinator,
  type FieldSaveStatus,
} from "./recipientSessionFieldMutationCoordinator";
import {
  completeRecipientSessionSigner,
  mutateRecipientSessionFieldOnce,
} from "./recipientSessionSigningApi";
import {
  hydrateRecipientSigningFields,
  isRecipientSigningEditableType,
  recipientFinishGateComplete,
  recipientFinishGateEditableFields,
} from "./recipientSigningFieldUtils";
import { setRecipientSessionDiagnosticsSuppressed } from "./vs01SignerFieldAssignment";

type Props = {
  packet: AdaptedRecipientSessionPacket;
  onSignerComplete: () => void;
  onStaleSession: () => void;
};

function statusMessage(status: FieldSaveStatus): string | null {
  switch (status) {
    case "saving":
      return "Saving your signing progress…";
    case "retryable-failure":
      return "We could not save your signing progress right now. Try again.";
    case "validation-error":
      return "This field could not be saved. Check your entry and try again.";
    case "stale-session":
      return "Your session is no longer valid.";
    default:
      return null;
  }
}

export function RecipientSessionSigningPanel(props: Props) {
  setRecipientSessionDiagnosticsSuppressed(true);
  const { packet } = props;
  const documentId = (packet.projection.document_id ?? "").trim() || null;
  const initialsEnabled = packet.projection.initials_policy.enabled;
  const coordinator = useMemo(
    () =>
      new RecipientSessionFieldMutationCoordinator(
        mutateRecipientSessionFieldOnce,
        packet.projection.field_values ?? {},
        packet.projection.field_revisions ?? {},
      ),
    [packet.projection.field_values, packet.projection.field_revisions],
  );

  const [fields, setFields] = useState<Vs01RecipientPlacedField[]>(() => {
    const cpById = new Map(packet.counterparties.map((cp) => [cp.id, cp] as const));
    return hydrateRecipientSigningFields(packet.fields, cpById, {
      preserveEditableValues: true,
      agreementId: null,
    });
  });
  const [panelError, setPanelError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [signerComplete, setSignerComplete] = useState(Boolean(packet.projection.signer_complete));

  useEffect(() => () => coordinator.dispose(), [coordinator]);

  const snapshots = useSyncExternalStore(
    (listener) => coordinator.subscribe(listener),
    () => coordinator.getAllSnapshots(),
    () => coordinator.getAllSnapshots(),
  );
  const saving = snapshots.some((snap) => snap.status === "saving");
  const blockingFailure = coordinator.hasBlockingFailure();
  const unresolvedWrites = coordinator.hasUnresolvedWrites();

  const finishReady = useMemo(
    () => recipientFinishGateComplete(fields, { initialsEnabled }),
    [fields, initialsEnabled],
  );

  const statusText = useMemo(() => {
    const priority: FieldSaveStatus[] = [
      "stale-session",
      "validation-error",
      "retryable-failure",
      "saving",
    ];
    for (const status of priority) {
      const snap = snapshots.find((item) => item.status === status);
      if (snap) return statusMessage(snap.status);
    }
    return null;
  }, [snapshots]);

  const handleFieldChange = useCallback((updater: SetStateAction<Vs01RecipientPlacedField[]>) => {
    setFields((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      for (const field of next) {
        const previous = current.find((item) => item.id === field.id);
        if (!previous || previous.value === field.value) continue;
        if (!isRecipientSigningEditableType(field.type)) continue;
        const value = typeof field.value === "string" ? field.value : "";
        coordinator.enqueue(field.id, value);
      }
      return next;
    });
  }, [coordinator]);

  const handleFinishSigning = useCallback(() => {
    if (signerComplete || finishing) return;
    if (!finishReady) {
      setPanelError("Complete all required signature fields before finishing.");
      return;
    }
    setFinishing(true);
    setPanelError(null);
    void coordinator.flushAll().then(async (flush) => {
      if (!flush.ok) {
        setFinishing(false);
        if (flush.reason === "stale-session") {
          props.onStaleSession();
          return;
        }
        if (flush.reason === "validation-error") {
          setPanelError("This field could not be saved. Check your entry and try again.");
          return;
        }
        if (flush.reason === "retryable-failure") {
          setPanelError("We could not save your signing progress right now. Try again.");
          return;
        }
        setPanelError("Your signing progress is still saving. Try again in a moment.");
        return;
      }
      const result = await completeRecipientSessionSigner();
      setFinishing(false);
      if (!result.ok) {
        if (result.kind === "authority") {
          props.onStaleSession();
          return;
        }
        setPanelError(result.message);
        return;
      }
      setSignerComplete(true);
      props.onSignerComplete();
    });
  }, [coordinator, finishReady, finishing, props, signerComplete]);

  const editableFields = useMemo(
    () => recipientFinishGateEditableFields(fields, { initialsEnabled }),
    [fields, initialsEnabled],
  );

  if (signerComplete) {
    return (
      <section
        className="vs01-recipient-signing-done"
        data-testid="recipient-session-signer-complete"
        aria-labelledby="vs01-recipient-session-done-title"
      >
        <h2 id="vs01-recipient-session-done-title" className="vs01-card-title">
          Your signing is complete
        </h2>
        <p className="vs01-card-help">
          Thank you. Your signature has been recorded securely. The agreement is not fully executed until
          all required signers finish.
        </p>
      </section>
    );
  }

  const displayError = panelError ?? statusText;

  return (
    <div data-testid="recipient-session-signing-panel">
      {displayError ? (
        <div className="vs01-error-banner" role="alert" data-testid="recipient-session-signing-status">
          {displayError}
          {blockingFailure ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              style={{ marginTop: "0.5rem", width: "auto" }}
              onClick={() => {
                for (const field of editableFields) {
                  coordinator.retry(field.id);
                }
                setPanelError(null);
              }}
            >
              Retry save
            </button>
          ) : (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary"
              style={{ marginTop: "0.5rem", width: "auto" }}
              onClick={() => setPanelError(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      ) : null}
      <RecipientSigningView
        documentId={documentId}
        counterparties={packet.counterparties}
        lockedCounterpartyId={packet.lockedCounterpartyId}
        recipientAgreementId={null}
        recipientAccessToken={null}
        recipientSessionCookie
        sessionCanonicalModel={packet.model}
        sessionCorpusHash={packet.projection.corpus_hash}
        lockedSignerRoleId={packet.lockedSignerRoleId}
        packetRevision={packet.projection.packet_revision}
        recipientFields={fields}
        senderPlacedFields={[]}
        senderSignatureRef={null}
        onRecipientFieldsChange={handleFieldChange}
        onError={setPanelError}
        onFinishSigning={handleFinishSigning}
        authoritativeInitialsEnabled={initialsEnabled}
      />
      {finishing || saving || unresolvedWrites ? (
        <p className="vs01-recipient-signing-progress" role="status" data-saving={saving ? "1" : "0"}>
          {finishing ? "Confirming your signature…" : "Saving your signing progress…"}
        </p>
      ) : null}
    </div>
  );
}
