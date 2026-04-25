import type { AgreementDraft } from "./agreementTypes";

/** Statuses we can represent from current agreement workspace data (no per-signer analytics yet). */
export type PendingSignerRowStatus = "not_sent" | "sent" | "signed";

export type PendingSignerRow = {
  name: string;
  email?: string;
  status: PendingSignerRowStatus;
  /** Extra line for timestamps or caveats from audit. */
  detail?: string;
};

function partyIsSigner(role: string): boolean {
  return (role || "").trim().toLowerCase() === "signer";
}

export function signatureCompletedParticipantIds(draft: AgreementDraft | null): Set<string> {
  const out = new Set<string>();
  for (const e of draft?.audit_log || []) {
    if (e.event_type !== "signature_completed") continue;
    const v = e.value as { participant_id?: string } | undefined;
    const id = String(v?.participant_id || "").trim();
    if (id) out.add(id);
  }
  return out;
}

export function hasLegacySignatureWithoutParticipant(draft: AgreementDraft | null): boolean {
  for (const e of draft?.audit_log || []) {
    if (e.event_type !== "signature_completed") continue;
    const v = e.value as { participant_id?: string } | undefined;
    if (!String(v?.participant_id || "").trim()) return true;
  }
  return false;
}

export function isAllSignersCompletedFromAudit(draft: AgreementDraft | null): boolean {
  if (!draft) return false;
  const signers = (draft.parties || []).filter((p) => partyIsSigner(p.role));
  if (!signers.length) return false;
  const done = signatureCompletedParticipantIds(draft);
  const ids = signers.map((p) => (p.id || "").trim());
  if (ids.length === signers.length && ids.every(Boolean)) {
    return ids.every((id) => done.has(id));
  }
  return signers.length === 1 && hasLegacySignatureWithoutParticipant(draft);
}

export function isAgreementMarkedSignedInAudit(draft: AgreementDraft | null): boolean {
  if (!draft) return false;
  if ((draft.audit_log || []).some((e) => e.event_type === "signed")) return true;
  return isAllSignersCompletedFromAudit(draft);
}

export function findSignedAuditTimestamp(draft: AgreementDraft | null): string | null {
  const cap = (draft?.audit_log || []).filter((e) => e.event_type === "signed").pop();
  if (cap?.at) return cap.at;
  const last = [...(draft?.audit_log || [])]
    .reverse()
    .find((e) => e.event_type === "signature_completed");
  return last?.at ?? null;
}

function signatureCompletedDetailForParticipant(
  draft: AgreementDraft | null,
  participantId: string
): string | undefined {
  const want = participantId.trim();
  if (!want) return undefined;
  const ev = [...(draft?.audit_log || [])]
    .reverse()
    .find((e) => {
      if (e.event_type !== "signature_completed") return false;
      const v = e.value as { participant_id?: string } | undefined;
      return String(v?.participant_id || "").trim() === want;
    });
  if (!ev?.at) return undefined;
  const t = new Date(ev.at).getTime();
  return Number.isNaN(t) ? `Recorded ${ev.at}` : `Signed ${new Date(ev.at).toLocaleString()}`;
}

export function isParticipantSignatureComplete(draft: AgreementDraft | null, participantId: string): boolean {
  const pid = (participantId || "").trim();
  if (pid) return signatureCompletedParticipantIds(draft).has(pid);
  return hasLegacySignatureWithoutParticipant(draft);
}

export function pendingSignatureCount(args: {
  draft: AgreementDraft;
  agreementFullySigned: boolean;
}): { pending: number; total: number } {
  const signerParties = (args.draft.parties || []).filter((p) => partyIsSigner(p.role));
  const total = signerParties.length;
  if (total === 0) return { pending: 0, total: 0 };
  if (args.agreementFullySigned) return { pending: 0, total };
  const done = signatureCompletedParticipantIds(args.draft);
  let completed = 0;
  for (const p of signerParties) {
    const id = (p.id || "").trim();
    if (id) {
      if (done.has(id)) completed += 1;
    } else if (signerParties.length === 1 && hasLegacySignatureWithoutParticipant(args.draft)) {
      completed = 1;
    }
  }
  return { pending: Math.max(0, total - completed), total };
}

/**
 * Recipient signers from `parties` only. Link is shared across them in the current architecture.
 */
export function buildPendingSignerRows(args: {
  draft: AgreementDraft;
  /** True when a signing URL is available to share (tokened or legacy path). */
  linkReady: boolean;
  agreementFullySigned: boolean;
}): { rows: PendingSignerRow[]; completedCount: number; total: number; summary: string } {
  const parties = args.draft.parties || [];
  const signerParties = parties.filter((p) => partyIsSigner(p.role));
  const total = signerParties.length;
  const agreementFullySigned = args.agreementFullySigned;
  const linkReady = args.linkReady;
  const doneIds = signatureCompletedParticipantIds(args.draft);
  const legacyDone = hasLegacySignatureWithoutParticipant(args.draft);

  const rows: PendingSignerRow[] = signerParties.map((p) => {
    const name = (p.name || "").trim() || "Signer";
    const email =
      typeof (p as { email?: string }).email === "string"
        ? (p as { email?: string }).email?.trim() || undefined
        : undefined;
    const sid = (p.id || "").trim();
    let status: PendingSignerRowStatus = "not_sent";
    let detail: string | undefined;

    if (sid && doneIds.has(sid)) {
      status = "signed";
      detail = signatureCompletedDetailForParticipant(args.draft, sid);
    } else if (!sid && legacyDone && signerParties.length === 1) {
      status = "signed";
      detail = findSignedAuditTimestamp(args.draft)
        ? `Signed ${new Date(findSignedAuditTimestamp(args.draft)! as string).toLocaleString()}`
        : undefined;
    } else if (agreementFullySigned) {
      status = "signed";
      detail = findSignedAuditTimestamp(args.draft)
        ? `Recorded ${new Date(findSignedAuditTimestamp(args.draft)! as string).toLocaleString()}`
        : undefined;
    } else if (linkReady) {
      status = "sent";
      detail = "Signing link is ready to share.";
    }
    return { name, ...(email ? { email } : {}), status, ...(detail ? { detail } : {}) };
  });

  const completedCount = rows.filter((r) => r.status === "signed").length;

  let summary: string;
  if (total === 0) {
    summary = "Add at least one signer on the Recipients step.";
  } else if (agreementFullySigned || completedCount >= total) {
    summary = total === 1 ? "All signers complete" : `All ${total} signers complete`;
  } else if (completedCount === 0) {
    summary = total === 1 ? "Waiting on 1 signer" : `Waiting on ${total} signers`;
  } else {
    const pend = total - completedCount;
    summary = pend === 1 ? "Waiting on 1 more signature" : `Waiting on ${pend} more signatures`;
  }

  return { rows, completedCount, total, summary };
}

export function formatPendingSignerStatusLabel(s: PendingSignerRowStatus): string {
  switch (s) {
    case "signed":
      return "Signed";
    case "sent":
      return "Sent";
    case "not_sent":
    default:
      return "Not sent";
  }
}
