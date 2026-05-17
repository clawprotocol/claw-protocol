import { useCallback, useEffect, useMemo, useState } from "react";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { logVs01LifecycleEvent } from "./vs01LifecycleAudit";
import { writePaidProVs01PostSignHandoff, type PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import {
  patchSignerPacketStatus,
  readSigningPacketStatus,
  signerKeyForHandoffRow,
  type Vs01SignerPacketStatus,
  type Vs01SigningPacketStatusSnapshot,
} from "./vs01SigningPacketStatusStore";

export type StepSigningPacketStatusProps = {
  handoff: PaidProVs01PostSignHandoffV1;
  prepareSignerRoles: Vs01PrepareSigningRole[];
  creatorDisplayName: string;
  onBack?: () => void;
  onRefresh?: () => void;
};

function statusLabel(s: Vs01SignerPacketStatus): string {
  if (s === "signed") return "Signed";
  if (s === "opened") return "In progress";
  return "Waiting";
}

export function StepSigningPacketStatus({
  handoff,
  prepareSignerRoles,
  creatorDisplayName,
  onBack,
  onRefresh,
}: StepSigningPacketStatusProps) {
  const nav = useLaunchNav();
  const [statusSnap, setStatusSnap] = useState<Vs01SigningPacketStatusSnapshot | null>(() =>
    readSigningPacketStatus(handoff.agreementId),
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const ownerRole = prepareSignerRoles[0] ?? null;
  const ownerKey = handoff.ownerSignerRoleId ?? ownerRole?.roleId ?? "owner";
  const ownerName =
    ownerRole?.entityName?.trim() || creatorDisplayName.trim() || "Sender";

  const rows = useMemo(() => {
    const out: {
      key: string;
      label: string;
      signingUrl: string;
      isOwner: boolean;
    }[] = [
      {
        key: ownerKey,
        label: ownerName,
        signingUrl: "",
        isOwner: true,
      },
    ];
    for (const s of handoff.signers) {
      out.push({
        key: signerKeyForHandoffRow(s, s.signerRoleId),
        label: s.displayName.trim() || "Signer",
        signingUrl: s.signingUrl?.trim() ?? "",
        isOwner: false,
      });
    }
    return out;
  }, [handoff.signers, ownerKey, ownerName]);

  const refreshStatus = useCallback(() => {
    setStatusSnap(readSigningPacketStatus(handoff.agreementId));
    onRefresh?.();
  }, [handoff.agreementId, onRefresh]);

  useEffect(() => {
    writePaidProVs01PostSignHandoff(handoff);
    refreshStatus();
  }, [handoff, refreshStatus]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const openSigner = useCallback(
    (key: string, url: string) => {
      if (!url) return;
      patchSignerPacketStatus(handoff.agreementId, key, "opened");
      logVs01LifecycleEvent({
        event: "vs01_signer_opened",
        agreementId: handoff.agreementId,
        documentId: handoff.vs01DocumentId,
        signerRoleId: key,
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
      });
      if (next?.fullySigned) {
        logVs01LifecycleEvent({
          event: "vs01_packet_fully_signed",
          agreementId: handoff.agreementId,
          documentId: handoff.vs01DocumentId,
        });
      }
      refreshStatus();
    },
    [handoff.agreementId, handoff.vs01DocumentId, refreshStatus],
  );

  const fullySigned = Boolean(statusSnap?.fullySigned);
  const senderMustSignFirst = Boolean(handoff.senderMustSignFirst && handoff.packetPrepareOnly);
  const ownerStatus = statusSnap?.bySignerKey[ownerKey] ?? "waiting";
  const ownerNeedsSign = senderMustSignFirst && ownerStatus !== "signed";

  return (
    <section className="vs01-step vs01-signing-packet-status" aria-labelledby="vs01-packet-status-title">
      <header className="vs01-step-header">
        <h1 id="vs01-packet-status-title" className="vs01-step-title">
          Signing packet ready
        </h1>
        <p className="vs01-step-lead">
          {fullySigned
            ? "Fully signed — download the final PDF and proof record from your agreement workspace."
            : ownerNeedsSign
              ? "Sign as the sender first, then share each counterparty link."
              : "Share each signing link and track progress below."}
        </p>
      </header>

      <ul className="vs01-packet-status-cards" aria-label="Signer status">
        {rows.map((row) => {
          const st = statusSnap?.bySignerKey[row.key] ?? "waiting";
          return (
            <li key={row.key} className={`vs01-packet-status-card vs01-packet-status-card--${st}`}>
              <div className="vs01-packet-status-card-head">
                <strong>{row.label}</strong>
                <span className="vs01-packet-status-badge">{statusLabel(st)}</span>
              </div>
              <div className="vs01-packet-status-card-actions">
                {row.signingUrl ? (
                  <>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--auto"
                      onClick={() => copyText(row.key, row.signingUrl)}
                    >
                      {copiedKey === row.key ? "Copied" : "Copy signer link"}
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--primary vs01-btn--auto"
                      onClick={() => openSigner(row.key, row.signingUrl)}
                    >
                      Open signer view
                    </button>
                  </>
                ) : row.isOwner && ownerNeedsSign ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Complete sender signing from the agreement workspace when you are ready.
                  </p>
                ) : null}
                {import.meta.env.DEV ? (
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--auto text-xs"
                    onClick={() => markSignedDev(row.key)}
                  >
                    Mark signed (dev)
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="vs01-sign-actions mt-4">
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
    </section>
  );
}
