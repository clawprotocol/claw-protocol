import { useCallback, useEffect, useMemo, useState } from "react";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { RecipientEmailCorrectionModal } from "../agreement/RecipientEmailCorrectionModal";
import {
  postSigningRecipientEmailCorrection,
  recipientEmailCorrectionErrorMessage,
  SIGNER_ALREADY_SIGNED_EMAIL_BLOCK,
} from "../agreement/recipientEmailCorrection";
import { RecipientControlCenter } from "../agreement/RecipientControlCenter";
import { recipientDeliveryLinkKey } from "../agreement/recipientDeliveryStatus";
import { logVs01LifecycleEvent } from "./vs01LifecycleAudit";
import { vs01DevMarkSignedEnabled } from "./vs01PreparePacketChecklist";
import type { PlacedSigningField } from "./signingFields";
import { writePaidProVs01PostSignHandoff, type PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import type { Vs01RecipientPlacedField } from "./types";
import { rebuildPrepareSigningUrlsFromStored } from "./vs01PreparePacketContinue";
import {
  buildPacketStatusCards,
  countSignedSigners,
  type PacketStatusCardRow,
} from "./vs01SigningPacketStatusCards";
import {
  patchSignerPacketStatus,
  readSigningPacketStatus,
  type Vs01SigningPacketStatusSnapshot,
} from "./vs01SigningPacketStatusStore";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

export type StepSigningPacketStatusProps = {
  handoff: PaidProVs01PostSignHandoffV1;
  prepareSignerRoles: Vs01PrepareSigningRole[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
  creatorDisplayName: string;
  onBack?: () => void;
  onRefresh?: () => void;
};

function SignerMetaLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="vs01-packet-status-meta-line">
      <span className="vs01-packet-status-meta-k">{label}</span>
      <span className="vs01-packet-status-meta-v">{value}</span>
    </p>
  );
}

function PacketStatusCard({
  card,
  copiedKey,
  showDevMark,
  onCopy,
  onOpen,
  onMarkSignedDev,
  onCorrectEmail,
}: {
  card: PacketStatusCardRow;
  copiedKey: string | null;
  showDevMark: boolean;
  onCopy: (key: string, url: string) => void;
  onOpen: (card: PacketStatusCardRow) => void;
  onMarkSignedDev: (key: string) => void;
  onCorrectEmail?: (card: PacketStatusCardRow) => void;
}) {
  const hasUrl = Boolean(card.signingUrl.trim());
  return (
    <li
      className={`vs01-packet-status-card vs01-packet-status-card--${card.status}${card.isOwner ? " vs01-packet-status-card--owner" : ""}`}
    >
      <div className="vs01-packet-status-card-top">
        <div className="vs01-packet-status-card-title-block">
          {card.isOwner ? (
            <span className="vs01-packet-status-owner-tag">You / sender</span>
          ) : card.roleLabel ? (
            <span className="vs01-packet-status-owner-tag">{card.roleLabel}</span>
          ) : null}
          <h2 className="vs01-packet-status-party-name">{card.partyName}</h2>
        </div>
        <span
          className={`vs01-packet-status-pill vs01-packet-status-pill--${card.status}`}
          aria-label={`Status: ${card.statusPill}`}
        >
          {card.statusPill}
        </span>
      </div>
      <div className="vs01-packet-status-card-body">
        {card.showSignerMetaLine && card.signerName ? (
          <SignerMetaLine label="Signer" value={card.signerName} />
        ) : null}
        {card.signerTitle ? <SignerMetaLine label="Title" value={card.signerTitle} /> : null}
        {card.signerEmail ? <SignerMetaLine label="Email" value={card.signerEmail} /> : null}
        {card.hint ? <p className="vs01-packet-status-hint">{card.hint}</p> : null}
        {card.status === "signed" ? (
          <p className="vs01-packet-status-hint">{SIGNER_ALREADY_SIGNED_EMAIL_BLOCK}</p>
        ) : null}
      </div>
      <div className="vs01-packet-status-card-actions">
        {hasUrl ? (
          <>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--auto"
              onClick={() => onOpen(card)}
            >
              {card.primaryLabel}
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--auto"
              disabled={!hasUrl}
              onClick={() => onCopy(card.key, card.signingUrl)}
            >
              {copiedKey === card.key ? "Copied" : card.secondaryLabel}
            </button>
            {onCorrectEmail && card.status !== "signed" ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--auto"
                onClick={() => onCorrectEmail(card)}
              >
                Edit email / Resend invite
              </button>
            ) : null}
          </>
        ) : (
          <p className="vs01-packet-status-hint">Signing link is not available for this party yet.</p>
        )}
        {showDevMark ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--auto vs01-packet-status-dev-btn"
            onClick={() => onMarkSignedDev(card.key)}
          >
            Mark signed (dev)
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function StepSigningPacketStatus({
  handoff,
  prepareSignerRoles,
  senderPlacedFields,
  recipientPlacedFields,
  creatorDisplayName: _creatorDisplayName,
  onBack,
  onRefresh,
}: StepSigningPacketStatusProps) {
  const nav = useLaunchNav();
  const [statusSnap, setStatusSnap] = useState<Vs01SigningPacketStatusSnapshot | null>(() =>
    readSigningPacketStatus(handoff.agreementId),
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [emailCorrectionCard, setEmailCorrectionCard] = useState<PacketStatusCardRow | null>(null);
  const [emailCorrectionBusy, setEmailCorrectionBusy] = useState(false);
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});
  const showDevMark = vs01DevMarkSignedEnabled();

  const effectiveHandoff = useMemo(() => {
    const rebuilt = rebuildPrepareSigningUrlsFromStored({
      handoff,
      roles: prepareSignerRoles,
      senderPlacedFields,
      recipientPlacedFields,
    });
    if (!rebuilt) return handoff;
    return {
      ...handoff,
      ownerSigningUrl: rebuilt.ownerSigningUrl,
      signers: rebuilt.signers,
      packetRevision: rebuilt.packetRevision ?? handoff.packetRevision,
    };
  }, [handoff, prepareSignerRoles, senderPlacedFields, recipientPlacedFields]);

  const ownerSigningUrl = (effectiveHandoff.ownerSigningUrl ?? "").trim();

  const cards = useMemo(() => {
    if (!prepareSignerRoles.length) return [];
    const built = buildPacketStatusCards({
      handoff: effectiveHandoff,
      roles: prepareSignerRoles,
      statusByKey: statusSnap?.bySignerKey ?? {},
      ownerSigningUrl,
    });
    return built.map((card) => {
      const override = emailOverrides[card.key];
      return override ? { ...card, signerEmail: override } : card;
    });
  }, [effectiveHandoff, prepareSignerRoles, statusSnap, ownerSigningUrl, emailOverrides]);

  const submitSigningEmailCorrection = useCallback(
    async (newEmail: string) => {
      const card = emailCorrectionCard;
      if (!card) return;
      setEmailCorrectionBusy(true);
      try {
        const result = await postSigningRecipientEmailCorrection({
          agreementId: handoff.agreementId,
          participantId: card.participantId,
          newEmail,
          signerRoleId: card.roleId,
          signingUrl: card.signingUrl,
          resendInvite: true,
        });
        if (!result.ok) {
          throw new Error(recipientEmailCorrectionErrorMessage(result.error));
        }
        setEmailOverrides((prev) => ({ ...prev, [card.key]: newEmail.trim() }));
        const nextHandoff = {
          ...effectiveHandoff,
          signers: effectiveHandoff.signers.map((s) =>
            (s.signerRoleId ?? "") === card.roleId || s.counterpartyId === card.participantId
              ? { ...s, email: newEmail.trim() }
              : s,
          ),
        };
        writePaidProVs01PostSignHandoff(nextHandoff);
        setEmailCorrectionCard(null);
      } finally {
        setEmailCorrectionBusy(false);
      }
    },
    [emailCorrectionCard, handoff.agreementId, effectiveHandoff],
  );

  const { signed, total } = useMemo(
    () => countSignedSigners(statusSnap?.bySignerKey ?? {}, cards.map((c) => c.key)),
    [statusSnap, cards],
  );

  const refreshStatus = useCallback(() => {
    setStatusSnap(readSigningPacketStatus(handoff.agreementId));
    onRefresh?.();
  }, [handoff.agreementId, onRefresh]);

  useEffect(() => {
    writePaidProVs01PostSignHandoff(effectiveHandoff);
    refreshStatus();
  }, [effectiveHandoff, refreshStatus]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (!ev.key?.includes(handoff.agreementId)) return;
      refreshStatus();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshStatus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshStatus);
    };
  }, [handoff.agreementId, refreshStatus]);

  const copyText = useCallback(async (key: string, text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const openSigner = useCallback(
    (card: PacketStatusCardRow) => {
      const url = card.signingUrl.trim();
      if (!url) return;
      patchSignerPacketStatus(handoff.agreementId, card.key, "opened");
      logVs01LifecycleEvent({
        event: "vs01_signer_opened",
        agreementId: handoff.agreementId,
        documentId: handoff.vs01DocumentId,
        signerRoleId: card.roleId,
        partyIndex: card.partyIndex,
        status: "opened",
      });
      refreshStatus();
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [handoff.agreementId, handoff.vs01DocumentId, refreshStatus],
  );

  const markSignedDev = useCallback(
    (key: string) => {
      const next = patchSignerPacketStatus(handoff.agreementId, key, "signed");
      logVs01LifecycleEvent({
        event: "vs01_signer_completed",
        agreementId: handoff.agreementId,
        documentId: handoff.vs01DocumentId,
        signerRoleId: key,
        status: "signed",
      });
      if (next?.fullySigned) {
        logVs01LifecycleEvent({
          event: "vs01_packet_fully_signed",
          agreementId: handoff.agreementId,
          documentId: handoff.vs01DocumentId,
          status: "fully_signed",
        });
      }
      refreshStatus();
    },
    [handoff.agreementId, handoff.vs01DocumentId, refreshStatus],
  );

  const fullySigned = Boolean(statusSnap?.fullySigned);
  const ownerCard = cards.find((c) => c.isOwner);
  const counterpartyCards = cards.filter((c) => !c.isOwner);

  const signingLinkByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const card of cards) {
      const pid = card.participantId.trim();
      const url = card.signingUrl.trim();
      if (pid && url) map[recipientDeliveryLinkKey("signing", pid)] = url;
    }
    return map;
  }, [cards]);

  const signingRoleIdForRow = useCallback(
    (row: { participant_id: string }) => {
      const card = cards.find((c) => c.participantId === row.participant_id);
      return card?.roleId ?? null;
    },
    [cards],
  );

  return (
    <section className="vs01-step vs01-signing-packet-status" aria-labelledby="vs01-packet-status-title">
      <header className="vs01-step-header vs01-packet-status-header">
        <h1 id="vs01-packet-status-title" className="vs01-step-title">
          Signature links are ready
        </h1>
        <p className="vs01-packet-status-summary" role="status">
          {signed} / {total} signed
        </p>
        <p className="vs01-step-lead">
          {fullySigned
            ? "Fully signed — download the final PDF and proof record from your agreement workspace."
            : "LawDog sent signing links to all parties. Each party can sign independently — the agreement is complete after everyone signs."}
        </p>
      </header>

      <RecipientControlCenter
        agreementId={handoff.agreementId}
        phase="signing"
        title="Signer delivery"
        linkByParticipantKey={signingLinkByKey}
        signerRoleIdForRow={signingRoleIdForRow}
        onDraftUpdated={() => refreshStatus()}
        className="vs01-packet-recipient-control"
      />

      {ownerCard ? (
        <ul className="vs01-packet-status-cards vs01-packet-status-cards--owner" aria-label="Sender">
          <PacketStatusCard
            card={ownerCard}
            copiedKey={copiedKey}
            showDevMark={showDevMark}
            onCopy={copyText}
            onOpen={openSigner}
            onMarkSignedDev={markSignedDev}
            onCorrectEmail={setEmailCorrectionCard}
          />
        </ul>
      ) : null}

      {counterpartyCards.length > 0 ? (
        <ul className="vs01-packet-status-cards" aria-label="Counterparty signers">
          {counterpartyCards.map((card) => (
            <PacketStatusCard
              key={card.key}
              card={card}
              copiedKey={copiedKey}
              showDevMark={showDevMark}
              onCopy={copyText}
              onOpen={openSigner}
              onMarkSignedDev={markSignedDev}
              onCorrectEmail={setEmailCorrectionCard}
            />
          ))}
        </ul>
      ) : null}

      <div className="vs01-sign-actions vs01-packet-status-footer">
        <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" onClick={() => onBack?.()}>
          Back to prepare
        </button>
        <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--auto" onClick={refreshStatus}>
          Refresh status
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--primary"
          onClick={() =>
            nav.navigate(`/app/agreements/${encodeURIComponent(handoff.agreementId)}?vs01_packet_ready=1`)
          }
        >
          Open agreement workspace
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--auto"
          onClick={() => nav.navigate("/app")}
        >
          Back to dashboard
        </button>
      </div>
      <RecipientEmailCorrectionModal
        open={Boolean(emailCorrectionCard)}
        phase="signing"
        partyName={emailCorrectionCard?.partyName ?? ""}
        currentEmail={emailCorrectionCard?.signerEmail ?? ""}
        busy={emailCorrectionBusy}
        onClose={() => {
          if (!emailCorrectionBusy) setEmailCorrectionCard(null);
        }}
        onConfirm={submitSigningEmailCorrection}
      />
    </section>
  );
}
