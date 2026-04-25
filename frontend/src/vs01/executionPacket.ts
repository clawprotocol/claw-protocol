/**
 * Deterministic execution / audit packet after signing lock. No AI, no mutation of agreement state.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import { agreementSigningPath } from "../agreement/AgreementRecipientReview";
import type { AgreementVersionBundle, AgreementVersionRecord } from "../agreement/agreementVersionStore";
import { isSigningLockActive } from "../agreement/agreementVersionStore";
import type { CloseRecommendation } from "./closeRecommendation";
import { clauseFrictionDisplayLabel } from "./negotiationPatterns";
import {
  buildNegotiationTimelineEvents,
  buildNegotiationTimelineSignals,
} from "./negotiationTimeline";
import { canonicalize, sha256Hex } from "../utils/agreements/hash";

export type ExecutionPacketProof = {
  receipt_id?: string;
  receipt_hash_sha256?: string;
  batch_id?: string;
  batch_merkle_root_sha256?: string;
  anchor_network?: string;
  anchor_txid?: string;
  anchor_status?: "queued" | "batched" | "anchoring" | "anchored" | "failed";
  anchor_cadence_blocks?: number;
  anchor_error?: string;
  anchor_attempts?: number;
  /** When set by backend (e.g. dual-chain receipt batch), ops-facing aggregate phase. */
  anchor_aggregate_phase?: string;
  /** Legacy single-network explorer link (timeline / receipt network). */
  anchor_explorer_url?: string;
  /** Dual-chain receipt-batch enrichment (anchoring DB); Bitcoin = canonical. */
  anchor_canonical_txid?: string;
  anchor_mirror_txid?: string;
  anchor_canonical_explorer_url?: string;
  anchor_mirror_explorer_url?: string;
  /** Per-chain metadata for operators (txid, status, timestamps). */
  anchor_dual_chain_ops?: {
    canonical_role: string;
    mirror_role: string;
    btc?: Record<string, unknown>;
    doge?: Record<string, unknown>;
  };
};

export type ExecutionPacket = {
  agreementId: string;
  finalizedVersionId: string;
  finalizedAt: string;

  agreement: {
    title: string;
    jurisdiction?: string;
    effectiveDate?: string;
    parties: Array<{
      name: string;
      role?: string;
    }>;
    content: string;
  };

  signers: Array<{
    name: string;
    role: "owner" | "recipient";
    email?: string;
    signingLink?: string;
  }>;

  negotiationSummary: {
    totalVersions: number;
    totalNegotiationEvents: number;
    topFrictionClauses: string[];
    finalState: string;
  };

  versionHistory: Array<{
    versionId: string;
    timestamp: string;
    actor: string;
    event: string;
    changedFields?: string[];
  }>;

  audit: {
    locked: true;
    lockedAt: string;
    lockedBy: string;
  };

  /** Populated after finalized-receipt registration / proof-status polling. */
  proof?: ExecutionPacketProof;
};

function normalizeWorkflowRole(role: string): string {
  const r = (role || "").trim().toLowerCase();
  if (r === "signer" || r === "reviewer" || r === "counterparty") return r;
  return "counterparty";
}

function recipientDisplayNameFromVersions(versions: AgreementVersionRecord[]): string | undefined {
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i]!;
    if (v.created_by === "recipient" && v.label?.trim()) return v.label.trim();
  }
  return undefined;
}

function finalStateFromSignals(
  rec: CloseRecommendation,
  patternEventCount: number
): string {
  if (patternEventCount < 2) {
    if (rec === "ready_to_close") return "Ready to close";
    return "Finalized for signing";
  }
  switch (rec) {
    case "ready_to_close":
      return "Ready to close";
    case "resolve_issues":
      return "Issues to review before signing";
    case "continue_negotiation":
      return "Negotiation paused at lock";
    case "pause_or_escalate":
      return "Pause and review before signing";
  }
}

export type BuildExecutionPacketInput = {
  agreementId: string;
  draft: AgreementDraft;
  bundle: AgreementVersionBundle;
  /** Origin only, e.g. https://example.com (no trailing slash). */
  origin: string;
  /** Optional API-minted ``t=`` link (production signing handoff). */
  signingAccessToken?: string | null;
  /**
   * When the local signing lock was cleared but a read-only “completed” view still needs a packet,
   * build from the latest saved version (same display shape as a locked packet).
   */
  useFinalVersionFallback?: boolean;
};

/**
 * Returns null if the bundle is not locked for signing or the locked version is missing.
 * Pure function: does not read or write storage.
 */
export function buildExecutionPacket(input: BuildExecutionPacketInput): ExecutionPacket | null {
  const { agreementId, draft, bundle, origin, signingAccessToken, useFinalVersionFallback } = input;

  let lockedVersionId: string;
  let locked: AgreementVersionRecord | undefined;
  let finalizedAt: string;
  let lockedBy: string;

  if (isSigningLockActive(bundle)) {
    const lock = bundle.signingLock!;
    lockedVersionId = lock.lockedVersionId!;
    locked = bundle.versions.find((v) => v.id === lockedVersionId);
    finalizedAt = lock.lockedAt || locked?.created_at || new Date().toISOString();
    lockedBy = lock.lockedBy || "owner";
  } else if (useFinalVersionFallback && bundle.versions.length > 0) {
    locked = bundle.versions[bundle.versions.length - 1]!;
    lockedVersionId = locked.id;
    finalizedAt = locked.created_at;
    lockedBy = "owner";
  } else {
    return null;
  }

  if (!locked) return null;

  const snap = locked.snapshot;

  const signals = buildNegotiationTimelineSignals(bundle.versions);
  const topFriction = signals.patterns.topFrictionClauses
    .slice(0, 3)
    .map((t) => clauseFrictionDisplayLabel(t.clause));

  const recipientName = recipientDisplayNameFromVersions(bundle.versions);
  const timelineEvents = buildNegotiationTimelineEvents(bundle.versions, {
    perspective: "owner",
    recipientDisplayName: recipientName,
    simplified: true,
    signingLock: bundle.signingLock ?? null,
    signingLockAudit: bundle.signingLockAudit,
  });

  const versionHistory = timelineEvents
    .filter((e) => e.versionId.length > 0)
    .map((e) => ({
      versionId: e.versionId,
      timestamp: e.timestamp,
      actor: e.actorLabel,
      event: e.title,
      ...(e.changedFields?.length ? { changedFields: [...e.changedFields] } : {}),
    }));

  const base = origin.replace(/\/$/, "");
  const signingPath = `${base}${agreementSigningPath(agreementId, lockedVersionId, signingAccessToken ?? undefined)}`;

  const signerParties = (draft.parties || []).filter((p) => normalizeWorkflowRole(p.role) === "signer");

  const ownerLabel =
    (draft.parties?.[0]?.name || "").trim() || "Agreement sender";

  const signers: ExecutionPacket["signers"] = [
    {
      name: `${ownerLabel} (sends this agreement)`,
      role: "owner",
    },
  ];

  for (const p of signerParties) {
    const nm = p.name.trim() || "Signer";
    signers.push({
      name: nm,
      role: "recipient",
      signingLink: signingPath,
    });
  }

  return {
    agreementId,
    finalizedVersionId: lockedVersionId,
    finalizedAt,
    agreement: {
      title: snap.title || "",
      ...(snap.jurisdiction ? { jurisdiction: snap.jurisdiction } : {}),
      ...(snap.effective_date ? { effectiveDate: snap.effective_date } : {}),
      parties: (snap.parties || []).map((p) => ({
        name: p.name || "",
        ...(p.role ? { role: p.role } : {}),
      })),
      content: locked.rendered_html || "",
    },
    signers,
    negotiationSummary: {
      totalVersions: bundle.versions.length,
      totalNegotiationEvents: signals.patterns.totalNegotiationEvents,
      topFrictionClauses: topFriction,
      finalState: finalStateFromSignals(signals.closeRecommendation, signals.patternEventCount),
    },
    versionHistory,
    audit: {
      locked: true,
      lockedAt: finalizedAt,
      lockedBy,
    },
  };
}

/**
 * Stable hashes for agreement_finalized receipts (matches backend canon JSON + SHA-256).
 * Excludes optional `proof` from the execution packet digest.
 */
export async function computeAgreementReceiptHashes(
  packet: ExecutionPacket
): Promise<{
  content_sha256: string;
  execution_packet_sha256: string;
  parties_sha256: string;
  signer_count: number;
}> {
  const content_sha256 = (await sha256Hex(packet.agreement.content)).toLowerCase();
  const parties_sha256 = (
    await sha256Hex(JSON.stringify(canonicalize(packet.agreement.parties)))
  ).toLowerCase();
  const { proof: _proof, ...rest } = packet;
  const execution_packet_sha256 = (
    await sha256Hex(JSON.stringify(canonicalize(rest)))
  ).toLowerCase();
  return {
    content_sha256,
    execution_packet_sha256,
    parties_sha256,
    signer_count: packet.signers.length,
  };
}

/** Plain-language export for archiving (no PDF dependency). */
export function executionPacketToPlainText(packet: ExecutionPacket): string {
  const lines: string[] = [];
  lines.push("CLAW — Signing record", "");
  lines.push(`Agreement ID: ${packet.agreementId}`);
  lines.push(`Finalized version: ${packet.finalizedVersionId}`);
  lines.push(`Finalized at: ${packet.finalizedAt}`, "");

  lines.push("— Agreement summary —");
  lines.push(`Title: ${packet.agreement.title}`);
  if (packet.agreement.jurisdiction) lines.push(`Governing law: ${packet.agreement.jurisdiction}`);
  if (packet.agreement.effectiveDate) lines.push(`Effective date: ${packet.agreement.effectiveDate}`);
  lines.push("Parties:");
  for (const p of packet.agreement.parties) {
    lines.push(`  • ${p.name}${p.role ? ` — ${p.role}` : ""}`);
  }
  lines.push("");

  lines.push("— Signers —");
  for (const s of packet.signers) {
    const link = s.signingLink ? `\n    Link: ${s.signingLink}` : "";
    lines.push(`  • ${s.name} (${s.role})${link}`);
  }
  lines.push("");

  lines.push("— Review summary —");
  lines.push(`Versions: ${packet.negotiationSummary.totalVersions}`);
  lines.push(`Review events: ${packet.negotiationSummary.totalNegotiationEvents}`);
  lines.push(`Final version at signing: ${packet.negotiationSummary.finalState}`);
  if (packet.negotiationSummary.topFrictionClauses.length > 0) {
    lines.push(`Focus areas: ${packet.negotiationSummary.topFrictionClauses.join("; ")}`);
  }
  lines.push("");

  lines.push("— Version history —");
  for (const row of packet.versionHistory) {
    const fields = row.changedFields?.length ? `; changed: ${row.changedFields.join(", ")}` : "";
    lines.push(`  • ${row.timestamp} — ${row.actor} — ${row.event}${fields}`);
  }
  lines.push("");

  lines.push("— Audit —");
  lines.push(`Locked: ${packet.audit.locked}`);
  lines.push(`Locked at: ${packet.audit.lockedAt}`);
  lines.push(`Locked by: ${packet.audit.lockedBy}`);
  lines.push("");
  lines.push("(Document HTML is included in the JSON export.)");

  return lines.join("\n");
}

export function downloadExecutionPacketJson(packet: ExecutionPacket): void {
  if (typeof document === "undefined") return;
  const json = JSON.stringify(packet, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agreement_${packet.agreementId}_signing_record.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExecutionPacketSummaryTxt(packet: ExecutionPacket): void {
  if (typeof document === "undefined") return;
  const text = executionPacketToPlainText(packet);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agreement_${packet.agreementId}_execution_summary.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
