/**
 * Structured negotiation timeline derived from version records + metadata only.
 * No LLM, no duplicate version engine.
 */

import type {
  AgreementVersionRecord,
  SigningLockAuditEntry,
  SigningLockState,
} from "../agreement/agreementVersionStore";
import { safeVersionInstructionSummary } from "../agreement/agreementVersionStore";
import type { NegotiationMemorySnapshot } from "../agreement/negotiationMemory";
import { detectChangedSnapshotFields } from "../agreement/negotiationMemory";
import { postureLabelForHistory } from "../agreement/negotiationPostures";
import { riskLabelForHistory, type NegotiationRiskTier } from "../agreement/negotiationRisk";
import type { NegotiationMemoryDecision } from "../agreement/negotiationMemory";
import type { ConvergenceAnalysis } from "./negotiationConvergence";
import { analyzeNegotiationConvergence, convergenceProgressHeadline } from "./negotiationConvergence";
import type { CloseRecommendation } from "./closeRecommendation";
import { buildCloseAnalysis, closeRecommendationHeadline } from "./closeRecommendation";
import { computeNegotiationPatterns, type NegotiationPatterns } from "./negotiationPatterns";
import { buildNegotiationSuggestions } from "./negotiationSuggestions";

export type NegotiationTimelineActor = "owner" | "recipient" | "external";

export type NegotiationTimelineEventType =
  | "draft_created"
  | "recipient_revision"
  | "owner_counter"
  | "accepted"
  | "rejected"
  | "external_import"
  | "finalized"
  | "negotiation_reopened";

export type NegotiationTimelineEvent = {
  id: string;
  versionId: string;
  timestamp: string;
  actorLabel: string;
  actorType: NegotiationTimelineActor;
  eventType: NegotiationTimelineEventType;
  title: string;
  /** Familiar contract-review label, e.g. "Original draft", "Revision 2 · Final version ready for signature". */
  revisionLabel?: string;
  detail?: string;
  posture?: string;
  riskLabel?: string;
  decision?: string;
  changedFields?: string[];
};

export type NegotiationTimelineCurrentStatus = {
  title: string;
  detail?: string;
};

export type BuildNegotiationTimelineOptions = {
  perspective: "owner" | "recipient";
  /** Display name for the recipient party (e.g. "Cindy" or "You"). */
  recipientDisplayName?: string;
  /** Fewer fragments in the detail line for read-only / recipient views. */
  simplified?: boolean;
  /** Locked version for signing (replaces legacy finalized-only flag). */
  signingLock?: SigningLockState | null;
  signingLockAudit?: SigningLockAuditEntry[] | null;
};

export type NegotiationTimelineSignals = {
  patterns: NegotiationPatterns;
  convergence: ConvergenceAnalysis;
  closeRecommendation: CloseRecommendation;
  patternEventCount: number;
};

type Classified = {
  eventType: NegotiationTimelineEventType;
  actorType: NegotiationTimelineActor;
};

function memoryDecisionLabel(d: NegotiationMemoryDecision | undefined): string {
  if (d === "accepted") return "Accepted";
  if (d === "rejected") return "Rejected";
  return "Modified";
}

/** User-facing revision step label (ordinal, not internal UUID). */
export function formatRevisionIdentityLabel(
  index: number,
  versionId: string,
  signingLock?: SigningLockState | null
): string {
  if (index === 0) {
    if (signingLock?.locked && signingLock.lockedVersionId === versionId) {
      return "Original draft · Final version ready for signature";
    }
    return "Original draft";
  }
  const base = `Revision ${index}`;
  if (signingLock?.locked && signingLock.lockedVersionId === versionId) {
    return `${base} · Final version ready for signature`;
  }
  return base;
}

function humanChangedFields(fields: string[] | undefined): string {
  if (!fields?.length) return "";
  const m: Record<string, string> = {
    title: "Title",
    jurisdiction: "Governing law",
    purpose: "Purpose",
    payment: "Payment terms",
    term: "Duration",
    due_date: "Due date",
    effective_date: "Effective date",
    parties: "Parties",
  };
  return [...new Set(fields.map((f) => m[f] || f))].join(", ");
}

function ownerActorLabel(perspective: "owner" | "recipient"): string {
  return perspective === "owner" ? "You" : "Owner";
}

function recipientActorLabel(
  v: AgreementVersionRecord,
  perspective: "owner" | "recipient",
  recipientDisplayName?: string
): string {
  if (perspective === "recipient") {
    return recipientDisplayName?.trim() || "You";
  }
  return v.label?.trim() || "Recipient";
}

function classify(v: AgreementVersionRecord, index: number): Classified {
  if (index === 0) {
    return { eventType: "draft_created", actorType: "owner" };
  }
  if (v.meta?.source === "external_ai_import") {
    return {
      eventType: "external_import",
      actorType: "external",
    };
  }
  if (v.created_by === "recipient") {
    return { eventType: "recipient_revision", actorType: "recipient" };
  }
  const rt = v.meta?.response_type;
  const src = v.meta?.source;
  if (src === "negotiation_response") {
    if (rt === "accept") return { eventType: "accepted", actorType: "owner" };
    if (rt === "reject") return { eventType: "rejected", actorType: "owner" };
    return { eventType: "owner_counter", actorType: "owner" };
  }
  return { eventType: "owner_counter", actorType: "owner" };
}

function eventTitleLine(
  v: AgreementVersionRecord,
  classified: Classified,
  perspective: "owner" | "recipient",
  recipientDisplayName?: string
): string {
  const o = ownerActorLabel(perspective);
  const r = recipientActorLabel(v, perspective, recipientDisplayName);

  switch (classified.eventType) {
    case "draft_created":
      return perspective === "owner" ? "You created the first draft" : "Owner created the first draft";
    case "recipient_revision":
      return perspective === "owner" ? `${r} proposed a revision` : "You proposed a revision";
    case "external_import":
      if (v.created_by === "recipient") {
        return perspective === "recipient"
          ? "You imported a suggested revision"
          : `${r} imported a suggested revision`;
      }
      return perspective === "owner" ? "You imported a suggested revision" : `${o} imported a suggested revision`;
    case "accepted":
      return perspective === "owner" ? "You accepted the latest version" : `${o} accepted the latest version`;
    case "rejected":
      return perspective === "owner" ? "You rejected the proposed change" : `${o} rejected the proposed change`;
    case "owner_counter":
      if (v.meta?.source === "owner_edit") {
        return perspective === "owner" ? "You updated the draft" : `${o} updated the draft`;
      }
      return perspective === "owner" ? "You responded with a counter" : `${o} sent a counterproposal`;
    case "finalized":
      return "Final version ready for signature";
    default:
      return perspective === "owner" ? "You updated the draft" : `${o} updated the draft`;
  }
}

function actorForClassified(
  v: AgreementVersionRecord,
  classified: Classified,
  perspective: "owner" | "recipient",
  recipientDisplayName?: string
): { actorType: NegotiationTimelineActor; actorLabel: string } {
  if (classified.eventType === "external_import") {
    if (v.created_by === "recipient") {
      return {
        actorType: "recipient",
        actorLabel: recipientActorLabel(v, perspective, recipientDisplayName),
      };
    }
    return {
      actorType: "owner",
      actorLabel: ownerActorLabel(perspective),
    };
  }
  if (classified.actorType === "owner") {
    return { actorType: "owner", actorLabel: ownerActorLabel(perspective) };
  }
  if (classified.actorType === "recipient") {
    return {
      actorType: "recipient",
      actorLabel: recipientActorLabel(v, perspective, recipientDisplayName),
    };
  }
  return { actorType: "external", actorLabel: recipientActorLabel(v, perspective, recipientDisplayName) };
}

function buildDetail(
  v: AgreementVersionRecord,
  options: BuildNegotiationTimelineOptions,
  prior: AgreementVersionRecord | null
): { detail?: string; posture?: string; riskLabel?: string; decision?: string; changedFields?: string[] } {
  const mem = v.meta?.negotiation_memory;
  const fragments: string[] = [];

  const snapChanged =
    prior != null
      ? detectChangedSnapshotFields(
          prior.snapshot as NegotiationMemorySnapshot,
          v.snapshot as NegotiationMemorySnapshot
        )
      : [];
  const mergedFields = [...new Set([...(mem?.changed_fields ?? []), ...snapChanged])];
  const fieldsHuman = humanChangedFields(mergedFields.length ? mergedFields : undefined);
  if (fieldsHuman) {
    fragments.push(`Changed: ${fieldsHuman}`);
  }

  const ins = safeVersionInstructionSummary(v.instruction);
  if (ins && !ins.toLowerCase().startsWith("original draft")) {
    const short = ins.length > 100 ? `${ins.slice(0, 99)}…` : ins;
    fragments.push(`Note: ${short}`);
  }

  const risk = v.meta?.risk_tier ? riskLabelForHistory(v.meta.risk_tier) : "";
  if (risk) fragments.push(`Risk note: ${risk}`);

  const posture = v.meta?.negotiation_posture ?? mem?.posture;
  const postureStr = posture ? postureLabelForHistory(posture) : "";
  if (postureStr) fragments.push(`Review stance: ${postureStr}`);

  if (mem?.decision) {
    fragments.push(`Outcome: ${memoryDecisionLabel(mem.decision)}`);
  }

  if (v.meta?.external_assist?.source === "user_pasted_external_ai") {
    fragments.push("Imported from external AI");
  }

  const maxN = options.simplified ? 2 : 3;
  const detail = fragments.slice(0, maxN).join(" · ") || undefined;

  return {
    detail,
    posture: postureStr || undefined,
    riskLabel: risk || undefined,
    decision: mem?.decision ? memoryDecisionLabel(mem.decision) : undefined,
    changedFields: mergedFields.length > 0 ? [...mergedFields] : undefined,
  };
}

function scanLatestOwnerMemory(versions: AgreementVersionRecord[]) {
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i]!;
    if (v.created_by !== "owner") continue;
    const m = v.meta?.negotiation_memory;
    if (!m) continue;
    return {
      posture: m.posture,
      risk_level: m.risk_level,
      changed_fields: m.changed_fields,
    };
  }
  return null;
}

function scanLatestOwnerRiskTier(versions: AgreementVersionRecord[]): NegotiationRiskTier | null {
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i]!;
    if (v.created_by !== "owner") continue;
    return v.meta?.risk_tier ?? null;
  }
  return null;
}

/** Convergence, close recommendation, and pattern stats — same inputs the negotiation assistant uses, without live panel state. */
export function buildNegotiationTimelineSignals(versions: AgreementVersionRecord[]): NegotiationTimelineSignals {
  const patterns = computeNegotiationPatterns(versions);
  const convergence = analyzeNegotiationConvergence(versions);
  if (versions.length === 0) {
    const emptySuggestions = buildNegotiationSuggestions({
      patterns,
      currentRiskTier: null,
      currentChangedFields: [],
      latestOwnerMemory: null,
    });
    const closeAnalysis = buildCloseAnalysis({
      patterns,
      convergence,
      suggestions: emptySuggestions,
      currentRiskTier: null,
    });
    return {
      patterns,
      convergence,
      closeRecommendation: closeAnalysis.recommendation,
      patternEventCount: patterns.totalNegotiationEvents,
    };
  }
  const head = versions[versions.length - 1]!;
  const prior = versions.length >= 2 ? versions[versions.length - 2]! : null;
  const currentChangedFields = detectChangedSnapshotFields(prior?.snapshot ?? null, head.snapshot);
  const latestOwnerMemory = scanLatestOwnerMemory(versions);
  const currentRiskTier = scanLatestOwnerRiskTier(versions);
  const negotiationSuggestions = buildNegotiationSuggestions({
    patterns,
    currentRiskTier,
    currentChangedFields,
    latestOwnerMemory,
  });
  const closeAnalysis = buildCloseAnalysis({
    patterns,
    convergence,
    suggestions: negotiationSuggestions,
    currentRiskTier,
  });
  return {
    patterns,
    convergence,
    closeRecommendation: closeAnalysis.recommendation,
    patternEventCount: patterns.totalNegotiationEvents,
  };
}

/**
 * One row per version, plus optional finalized synthetic row.
 */
function mergeSigningLockAudit(
  events: NegotiationTimelineEvent[],
  audit: SigningLockAuditEntry[] | null | undefined,
  perspective: "owner" | "recipient"
): NegotiationTimelineEvent[] {
  const reopen = (audit ?? []).filter((a) => a.kind === "reopened");
  if (reopen.length === 0) return events;
  const extra: NegotiationTimelineEvent[] = reopen.map((a, i) => ({
    id: `audit_reopen_${a.at}_${i}`,
    versionId: "",
    timestamp: a.at,
    actorLabel: perspective === "owner" ? "You" : "Owner",
    actorType: "owner",
    eventType: "negotiation_reopened",
    revisionLabel: "Review reopened",
    title: "Review reopened",
    detail:
      perspective === "owner"
        ? "You can edit terms again until you share a final version for signature."
        : "The sender reopened review — this is no longer the final version for signature.",
  }));
  return [...events, ...extra].sort(
    (x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime()
  );
}

export function buildNegotiationTimelineEvents(
  versions: AgreementVersionRecord[],
  options: BuildNegotiationTimelineOptions
): NegotiationTimelineEvent[] {
  const out: NegotiationTimelineEvent[] = [];
  const { perspective, recipientDisplayName, signingLock, signingLockAudit } = options;

  for (let i = 0; i < versions.length; i++) {
    const v = versions[i]!;
    const prior = i > 0 ? versions[i - 1]! : null;
    const revisionLabel = formatRevisionIdentityLabel(i, v.id, signingLock);
    if (i === 0) {
      const classified: Classified = { eventType: "draft_created", actorType: "owner" };
      const extras = buildDetail(v, options, prior);
      out.push({
        id: `${v.id}_timeline`,
        versionId: v.id,
        timestamp: v.created_at,
        actorLabel: ownerActorLabel(perspective),
        actorType: "owner",
        eventType: "draft_created",
        title: eventTitleLine(v, classified, perspective, recipientDisplayName),
        revisionLabel,
        ...extras,
      });
      continue;
    }

    const classified = classify(v, i);
    const extras = buildDetail(v, options, prior);
    const { actorType, actorLabel } = actorForClassified(v, classified, perspective, recipientDisplayName);

    out.push({
      id: `${v.id}_timeline`,
      versionId: v.id,
      timestamp: v.created_at,
      actorLabel,
      actorType,
      eventType: classified.eventType,
      title: eventTitleLine(v, classified, perspective, recipientDisplayName),
      revisionLabel,
      ...extras,
    });
  }

  if (signingLock?.locked && signingLock.lockedVersionId && versions.length > 0) {
    const vid = signingLock.lockedVersionId;
    const lockedVer = versions.find((v) => v.id === vid);
    const ts = signingLock.lockedAt || lockedVer?.created_at || versions[versions.length - 1]!.created_at;
    out.push({
      id: `finalized_${vid}`,
      versionId: vid,
      timestamp: ts,
      actorLabel: ownerActorLabel(perspective),
      actorType: "owner",
      eventType: "finalized",
      revisionLabel: "Final version ready for signature",
      title: "Final version ready for signature",
      detail:
        perspective === "owner"
          ? "Recipients will sign this version only."
          : "This is the version shared for e-signature.",
    });
  }

  return mergeSigningLockAudit(out, signingLockAudit, perspective);
}

/**
 * Compact status strip using convergence + close recommendation + queue hints.
 */
export function buildNegotiationTimelineCurrentStatus(args: {
  versions: AgreementVersionRecord[];
  perspective: "owner" | "recipient";
  signingLock?: SigningLockState | null;
  convergence: ConvergenceAnalysis | null;
  closeRecommendation: CloseRecommendation | null;
  patternEventCount: number;
}): NegotiationTimelineCurrentStatus | null {
  const {
    versions,
    perspective,
    signingLock,
    convergence,
    closeRecommendation,
    patternEventCount,
  } = args;

  if (signingLock?.locked && signingLock.lockedVersionId) {
    return {
      title: "Current status: Final version ready for signature",
      detail: "No further edits until the sender allows changes again — signers use the signing link the sender shares.",
    };
  }

  if (versions.length <= 1) {
    return {
      title: "Current status: Draft only",
      detail: "This list will grow as the agreement is reviewed and updated.",
    };
  }

  const last = versions[versions.length - 1]!;
  /** Owner issued the latest version — counterparty’s turn to respond. */
  const waitingOnRecipient = last.created_by === "owner";
  /** Recipient issued the latest version — owner’s turn. */
  const waitingOnOwnerSide = last.created_by === "recipient";

  const parts: string[] = [];
  if (convergence) {
    parts.push(convergenceProgressHeadline(convergence.state));
  }
  if (closeRecommendation && patternEventCount >= 2) {
    parts.push(closeRecommendationHeadline(closeRecommendation));
  }

  let title = "Current status: Review in progress";
  if (perspective === "owner" && waitingOnRecipient) {
    title = "Current status: Waiting on recipient review";
  } else if (perspective === "owner" && waitingOnOwnerSide) {
    title = "Current status: Your turn to respond";
  } else if (perspective === "recipient" && waitingOnOwnerSide) {
    title = "Current status: With the owner for review";
  } else if (perspective === "recipient" && waitingOnRecipient) {
    title = "Current status: Your turn to review";
  }

  if (closeRecommendation === "ready_to_close" && patternEventCount >= 2) {
    title = "Current status: Close to final";
  }

  const detail =
    parts.length > 0 ? parts.slice(0, 2).join(" · ") : "Both sides can follow every step in this shared timeline.";

  return { title, detail };
}
