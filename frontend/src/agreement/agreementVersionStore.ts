/**
 * Client-side version history for Agreement Workspace (mirrors future backend schema).
 * Full snapshots + rendered HTML per version for read-only timeline / recipient flow.
 */

import type { AgreementDraft } from "./agreementTypes";
import { postureLabelForHistory, type NegotiationPosture } from "./negotiationPostures";
import {
  riskLabelForHistory,
  type NegotiationRiskConfidence,
  type NegotiationRiskTier,
} from "./negotiationRisk";
import type { NegotiationMemory } from "./negotiationMemory";

export type AgreementVersionAuthor = "owner" | "recipient";

export type NegotiationResponseType =
  | "accept"
  | "counter"
  | "reject"
  | "custom"
  | "suggested_option"
  /** @deprecated legacy localStorage */
  | "claw_option";

/** Pasted content from outside CLAW (e.g. ChatGPT); never auto-applied without user action. */
export type ExternalAssistMeta = {
  source: "user_pasted_external_ai";
  applied: boolean;
  imported_at: string;
  scope: "full_draft" | "clause" | "instruction";
};

/** Per-version negotiation / provenance (immutable once written). */
export type VersionMeta = {
  source?: "negotiation_response" | "recipient_revision" | "owner_edit" | "external_ai_import";
  responds_to_version_id?: string;
  response_type?: NegotiationResponseType;
  /** Plain-language line for timeline / assistant */
  negotiation_summary?: string;
  /** Short badge in version history */
  action_badge?: string;
  /** Playbook used when applying a CLAW suggestion (optional for manual actions). */
  negotiation_posture?: NegotiationPosture;
  /** Informational risk triage when owner responded (not legal advice). */
  risk_tier?: NegotiationRiskTier;
  risk_label?: string;
  risk_rationale?: string;
  risk_helper_text?: string;
  risk_confidence?: NegotiationRiskConfidence;
  /** Deterministic structured record of this negotiation step (optional). */
  negotiation_memory?: NegotiationMemory;
  /** Optional trace of local pattern-based suggestions at respond time (advisory only). */
  suggestion_context?: {
    suggested_posture?: NegotiationPosture;
    escalation_hint?: "none" | "watch" | "manual_review";
    based_on_pattern_count?: number;
  };
  /** User pasted suggestions from an external LLM into CLAW (tracked only if applied as a version). */
  external_assist?: ExternalAssistMeta;
  import_scope?: "full_draft" | "clause" | "instruction";
  /** Recipient ran compare preview before this version was saved. */
  previewed?: boolean;
  /** ISO time when the recipient committed the revision (client clock). */
  submitted_at?: string;
  /** Recipient inserted or followed a deterministic suggestion hint. */
  suggestion_used?: boolean;
};

export type { NegotiationPosture };
export type { NegotiationRiskTier, NegotiationRiskAssessment, NegotiationRiskConfidence } from "./negotiationRisk";
export type { NegotiationMemory } from "./negotiationMemory";

/** Serializable subset of draft fields (immutable snapshot per version). */
export type AgreementSnapshot = Pick<
  AgreementDraft,
  | "title"
  | "jurisdiction"
  | "parties"
  | "purpose"
  | "payment_terms"
  | "duration"
  | "due_date"
  | "effective_date"
>;

export type SigningLockState = {
  locked: boolean;
  lockedVersionId?: string;
  lockedAt?: string;
  lockedBy?: "owner";
};

/** Append-only audit for timeline and accountability (local only). */
export type SigningLockAuditEntry = {
  at: string;
  kind: "locked" | "reopened";
  versionId?: string;
};

export type AgreementVersionRecord = {
  id: string;
  created_at: string;
  created_by: AgreementVersionAuthor;
  /** Short display line (e.g. party name). */
  label?: string;
  /** User- or recipient-supplied instruction / redline request. */
  instruction: string;
  snapshot: AgreementSnapshot;
  rendered_html: string;
  meta?: VersionMeta;
};

export type AgreementVersionBundle = {
  agreementId: string;
  currentVersionId: string;
  versions: AgreementVersionRecord[];
  /** ISO timestamp when owner clicked Send for review. */
  reviewSentAt?: string;
  /** Draft updated_at last acknowledged by owner (server sync). */
  ownerLastSeenUpdatedAt?: string;
  /** True when server draft moved past ownerLastSeen without local append (recipient or other tab). */
  pendingRecipientNotice?: boolean;
  /**
   * Owner confirmed a specific version is the one to sign against.
   * Prefer {@link signingLock}; this stays in sync for older bundles.
   */
  finalizedForSigning?: boolean;
  /** Single source of truth for which version is the signing target. */
  signingLock?: SigningLockState;
  signingLockAudit?: SigningLockAuditEntry[];
};

const storageKey = (agreementId: string) => `claw_agreement_versions_v1:${agreementId}`;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Revision-history rows: safe one-line summary when `instruction` is missing or non-string
 * (stale localStorage bundles, partial hydration). Never throws.
 */
export function safeVersionInstructionSummary(instruction: unknown): string {
  if (instruction == null) return "";
  const raw = typeof instruction === "string" ? instruction : String(instruction);
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}

export function draftToSnapshot(d: AgreementDraft): AgreementSnapshot {
  return {
    title: d.title,
    jurisdiction: d.jurisdiction,
    parties: d.parties,
    purpose: d.purpose,
    payment_terms: d.payment_terms,
    duration: d.duration,
    due_date: d.due_date,
    effective_date: d.effective_date,
  };
}

export function versionActionBadge(v: AgreementVersionRecord): string {
  if (v.meta?.source === "external_ai_import") {
    return v.meta.action_badge || "External AI import";
  }
  if (v.meta?.external_assist?.source === "user_pasted_external_ai") {
    const sc = v.meta.external_assist.scope;
    if (sc === "clause") return "Imported clause suggestion";
    return "Imported revision";
  }
  if (v.meta?.action_badge) return v.meta.action_badge;
  if (v.created_by === "recipient") return "Recipient revision";
  const rt = v.meta?.response_type;
  if (v.meta?.source === "negotiation_response" && rt === "accept") return "Accepted revision";
  if (v.meta?.source === "negotiation_response" && rt === "reject") return "Rejected revision";
  if (
    v.meta?.source === "negotiation_response" &&
    (rt === "suggested_option" || rt === "claw_option")
  ) {
    return "Suggested option";
  }
  if (v.meta?.source === "negotiation_response" && (rt === "counter" || rt === "custom")) {
    return "Owner counter";
  }
  if (v.meta?.source === "owner_edit") return "Owner edit";
  return v.created_by === "owner" ? "Owner edit" : "Recipient revision";
}

function withPostureSuffix(line: string, v: AgreementVersionRecord): string {
  const pid = v.meta?.negotiation_posture;
  if (!pid) return line;
  const label = postureLabelForHistory(pid);
  return label ? `${line} · ${label}` : line;
}

function withRiskTierSuffix(line: string, v: AgreementVersionRecord): string {
  const rt = v.meta?.risk_tier;
  if (!rt) return line;
  const label = riskLabelForHistory(rt);
  return label ? `${line} · ${label}` : line;
}

function withNegotiationSuffixes(line: string, v: AgreementVersionRecord): string {
  return withRiskTierSuffix(withPostureSuffix(line, v), v);
}

/** Compact lines for Step 3 timeline (derived from version records, not chat). */
export function negotiationTimelineLines(versions: AgreementVersionRecord[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < versions.length; i++) {
    const v = versions[i];
    const who = v.label || (v.created_by === "owner" ? "You" : "Recipient");
    if (v.meta?.negotiation_summary?.trim()) {
      out.push(withNegotiationSuffixes(`${who} ${v.meta.negotiation_summary.trim()}`, v));
      continue;
    }
    if (v.created_by === "recipient") {
      const insText = String(v.instruction ?? "").trim();
      const bit = insText.length > 88 ? `${insText.slice(0, 85)}…` : insText || "…";
      out.push(withNegotiationSuffixes(`${who} proposed a revision (${bit})`, v));
    } else if (v.meta?.source === "negotiation_response") {
      const rt = v.meta.response_type;
      let line: string;
      if (rt === "accept") line = `${who} accepted the last revision`;
      else if (rt === "reject") line = `${who} rejected the last revision`;
      else line = `${who} sent a counterproposal`;
      out.push(withNegotiationSuffixes(line, v));
    } else {
      out.push(withNegotiationSuffixes(`${who} updated the draft`, v));
    }
  }
  return out;
}

export function isSigningLockActive(bundle: AgreementVersionBundle | null | undefined): boolean {
  return Boolean(bundle?.signingLock?.locked && bundle.signingLock.lockedVersionId);
}

/** Upgrade legacy `finalizedForSigning` into structured lock when needed (persists once). */
export function migrateBundleSigningLock(bundle: AgreementVersionBundle): AgreementVersionBundle {
  if (isSigningLockActive(bundle)) return bundle;
  if (bundle.finalizedForSigning && bundle.versions.length > 0) {
    const lockedVersionId = bundle.currentVersionId;
    const last = bundle.versions[bundle.versions.length - 1];
    return {
      ...bundle,
      signingLock: {
        locked: true,
        lockedVersionId,
        lockedAt: bundle.reviewSentAt || last?.created_at,
        lockedBy: "owner",
      },
    };
  }
  return bundle;
}

export function loadBundle(agreementId: string): AgreementVersionBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(agreementId));
    if (!raw) return null;
    const p = JSON.parse(raw) as AgreementVersionBundle;
    if (!p?.agreementId || p.agreementId !== agreementId || !Array.isArray(p.versions)) return null;
    const migrated = migrateBundleSigningLock(p);
    if (
      migrated !== p &&
      isSigningLockActive(migrated) &&
      !isSigningLockActive(p)
    ) {
      saveBundle(migrated);
    }
    return migrated;
  } catch {
    return null;
  }
}

export function saveBundle(bundle: AgreementVersionBundle): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(bundle.agreementId), JSON.stringify(bundle));
}

/** Ensure at least v0 from current server draft + render. */
export function ensureInitialVersion(
  agreementId: string,
  draft: AgreementDraft,
  renderedHtml: string
): AgreementVersionBundle {
  const existing = loadBundle(agreementId);
  if (existing && existing.versions.length > 0) {
    return existing;
  }
  const vid = newId();
  const v0: AgreementVersionRecord = {
    id: vid,
    created_at: draft.updated_at || draft.created_at || new Date().toISOString(),
    created_by: "owner",
    instruction: "Original draft",
    label: "You",
    snapshot: draftToSnapshot(draft),
    rendered_html: renderedHtml,
    meta: { source: "owner_edit", action_badge: "Original draft" },
  };
  const bundle: AgreementVersionBundle = {
    agreementId,
    currentVersionId: vid,
    versions: [v0],
    ownerLastSeenUpdatedAt: draft.updated_at,
  };
  saveBundle(bundle);
  return bundle;
}

export function appendVersion(args: {
  agreementId: string;
  draft: AgreementDraft;
  renderedHtml: string;
  instruction: string;
  createdBy: AgreementVersionAuthor;
  label?: string;
  meta?: VersionMeta;
}): AgreementVersionBundle {
  let cur = loadBundle(args.agreementId);
  if (cur && isSigningLockActive(cur)) {
    return cur;
  }
  const recCore = {
    instruction: args.instruction,
    label: args.label,
    snapshot: draftToSnapshot(args.draft),
    rendered_html: args.renderedHtml,
    meta: args.meta,
  };
  if (!cur || cur.versions.length === 0) {
    const vid = newId();
    const first: AgreementVersionRecord = {
      id: vid,
      created_at: args.draft.updated_at || new Date().toISOString(),
      created_by: args.createdBy,
      ...recCore,
    };
    cur = {
      agreementId: args.agreementId,
      currentVersionId: vid,
      versions: [first],
      ownerLastSeenUpdatedAt: args.draft.updated_at,
      pendingRecipientNotice: args.createdBy === "recipient",
    };
    saveBundle(cur);
    return cur;
  }
  const vid = newId();
  const rec: AgreementVersionRecord = {
    id: vid,
    created_at: new Date().toISOString(),
    created_by: args.createdBy,
    ...recCore,
  };
  const next: AgreementVersionBundle = {
    ...cur,
    currentVersionId: vid,
    versions: [...cur.versions, rec],
    ownerLastSeenUpdatedAt: args.draft.updated_at,
    pendingRecipientNotice: args.createdBy === "recipient",
  };
  saveBundle(next);
  return next;
}

export function setReviewSent(agreementId: string): AgreementVersionBundle | null {
  const cur = loadBundle(agreementId);
  if (!cur) return null;
  const next = { ...cur, reviewSentAt: new Date().toISOString() };
  saveBundle(next);
  return next;
}

export function clearPendingRecipientNotice(agreementId: string): void {
  const cur = loadBundle(agreementId);
  if (!cur) return;
  saveBundle({ ...cur, pendingRecipientNotice: false });
}

export function setFinalizedForSigning(agreementId: string, value: boolean): void {
  const cur = loadBundle(agreementId);
  if (!cur) return;
  if (!value) {
    saveBundle({ ...cur, finalizedForSigning: false, signingLock: { locked: false } });
    return;
  }
  if (cur.versions.length === 0) return;
  applySigningLock(agreementId, cur.currentVersionId);
}

/**
 * Mark one version as the only signing target. Closes negotiation until reopened.
 */
export function applySigningLock(agreementId: string, versionId: string): AgreementVersionBundle | null {
  const cur = loadBundle(agreementId);
  if (!cur || cur.versions.length === 0) return null;
  if (!cur.versions.some((v) => v.id === versionId)) return null;
  const at = new Date().toISOString();
  const next: AgreementVersionBundle = {
    ...cur,
    finalizedForSigning: true,
    signingLock: {
      locked: true,
      lockedVersionId: versionId,
      lockedAt: at,
      lockedBy: "owner",
    },
    signingLockAudit: [...(cur.signingLockAudit ?? []), { at, kind: "locked", versionId }],
  };
  saveBundle(next);
  return next;
}

/** Owner clears lock so negotiation can continue. Previous signing links are no longer valid. */
export function clearSigningLock(agreementId: string): AgreementVersionBundle | null {
  const cur = loadBundle(agreementId);
  if (!cur) return null;
  const at = new Date().toISOString();
  const next: AgreementVersionBundle = {
    ...cur,
    finalizedForSigning: false,
    signingLock: { locked: false },
    signingLockAudit: [...(cur.signingLockAudit ?? []), { at, kind: "reopened" }],
  };
  saveBundle(next);
  return next;
}

/**
 * Align local signing lock with server `GET /api/agreements/:id` (`signing_lock` field).
 * - `signingLockPayload === undefined` — response omitted `signing_lock`; local bundle unchanged.
 * - Key present with `null` or without a usable `locked_version_id` — clear local lock if one was set.
 * - Object with non-empty `locked_version_id` — set local lock to match server (server-authoritative).
 */
export function mergeServerSigningLockIntoBundle(
  agreementId: string,
  signingLockPayload: Record<string, unknown> | null | undefined,
): AgreementVersionBundle | null {
  if (typeof window === "undefined") return null;
  if (signingLockPayload === undefined) {
    return loadBundle(agreementId);
  }
  const cur = loadBundle(agreementId);
  if (!cur) return null;

  const lvRaw =
    signingLockPayload &&
    typeof signingLockPayload === "object" &&
    typeof signingLockPayload.locked_version_id === "string"
      ? signingLockPayload.locked_version_id.trim()
      : "";

  if (lvRaw && signingLockPayload) {
    const next: AgreementVersionBundle = {
      ...cur,
      finalizedForSigning: true,
      signingLock: {
        locked: true,
        lockedVersionId: lvRaw,
        lockedAt:
          typeof signingLockPayload.locked_at === "string" ? signingLockPayload.locked_at : undefined,
        lockedBy: "owner",
      },
    };
    saveBundle(next);
    return next;
  }

  if (cur.signingLock?.locked) {
    const next: AgreementVersionBundle = {
      ...cur,
      finalizedForSigning: false,
      signingLock: { locked: false },
    };
    saveBundle(next);
    return next;
  }

  return cur;
}

/** If server draft changed since owner last saw it, append a version from server (recipient or other client). */
export function syncOwnerFromServerDraft(args: {
  agreementId: string;
  draft: AgreementDraft;
  renderedHtml: string;
}): AgreementVersionBundle {
  let bundle = loadBundle(args.agreementId);
  if (!bundle || bundle.versions.length === 0) {
    return ensureInitialVersion(args.agreementId, args.draft, args.renderedHtml);
  }
  const lastSeen = bundle.ownerLastSeenUpdatedAt || "";
  const serverAt = args.draft.updated_at || "";
  if (!serverAt || serverAt === lastSeen) {
    return bundle;
  }
  const lastSnap = JSON.stringify(bundle.versions[bundle.versions.length - 1]?.snapshot);
  const serverSnap = JSON.stringify(draftToSnapshot(args.draft));
  if (lastSnap === serverSnap) {
    bundle = { ...bundle, ownerLastSeenUpdatedAt: serverAt };
    saveBundle(bundle);
    return bundle;
  }
  if (isSigningLockActive(bundle)) {
    const lockedId = bundle.signingLock!.lockedVersionId!;
    const lockedVer = bundle.versions.find((v) => v.id === lockedId);
    if (lockedVer && serverSnap === JSON.stringify(lockedVer.snapshot)) {
      bundle = { ...bundle, ownerLastSeenUpdatedAt: serverAt };
      saveBundle(bundle);
      return bundle;
    }
    return bundle;
  }
  const audit = args.draft.audit_log || [];
  let instruction = "Updated draft";
  for (let i = audit.length - 1; i >= 0; i--) {
    const e = audit[i];
    if (e?.field === "chat_revise" && typeof e.value === "string" && e.value.trim()) {
      instruction = e.value.trim();
      break;
    }
  }
  const vid = newId();
  const rec: AgreementVersionRecord = {
    id: vid,
    created_at: serverAt,
    created_by: "recipient",
    instruction,
    label: "Recipient",
    snapshot: draftToSnapshot(args.draft),
    rendered_html: args.renderedHtml,
    meta: {
      source: "recipient_revision",
      action_badge: "Recipient revision",
      negotiation_summary: `Proposed revision: ${instruction.length > 100 ? `${instruction.slice(0, 97)}…` : instruction}`,
    },
  };
  bundle = {
    ...bundle,
    currentVersionId: vid,
    versions: [...bundle.versions, rec],
    ownerLastSeenUpdatedAt: serverAt,
    pendingRecipientNotice: true,
  };
  saveBundle(bundle);
  return bundle;
}
