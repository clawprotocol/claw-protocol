/**
 * Paid Pro corpus source-path diagnostics and authority drift guards.
 * Trace: home → starter → checkout → server_full_draft → freeze → review → handoff → VS01.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN } from "./premiumAuthoritativeBodyPreservation";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

export type ProCorpusSourceMapStage =
  | "home_textarea"
  | "free_starter"
  | "checkout_launch"
  | "premium_request"
  | "server_full_draft_received"
  | "sot_overwrite_blocked_downgrade"
  | "sot_overwrite_blocked_post_acceptance"
  | "client_gates_passed"
  | "pre_freeze_orphan_subsection_repair"
  | "pre_freeze_orphan_section_number_repair"
  | "pre_freeze_placeholder_repair"
  | "pre_freeze_canonical_structure_authority"
  | "authoritative_pro_freeze"
  | "pro_review_display"
  | "review_link_payload"
  | "signature_prep_base"
  | "vs01_base";

export const PRO_CORPUS_AUTHORITY_DRIFT_MIN_RATIO = 0.9;

export type ProCorpusSourceMapPayload = {
  stage: ProCorpusSourceMapStage;
  source: string;
  len: number;
  hash?: string;
  /** When set, used to compute hash for the source-map log. */
  text?: string;
  allowedToOverride: boolean;
  reason: string;
};

export type ProCorpusAuthorityDriftPayload = {
  authoritativeLen: number;
  displayLen: number;
  authoritativeHash: string;
  displayHash: string;
  source: string;
  surface: string;
};

export type ProCorpusAuthorityDriftResult = {
  ok: boolean;
  blocked: boolean;
  displayText: string;
  drift?: ProCorpusAuthorityDriftPayload;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function hashProCorpusSourceText(text: string): string {
  return fingerprintAgreementBody(text || "");
}

export function logProCorpusSourceMap(payload: ProCorpusSourceMapPayload): void {
  const text = trim(payload.text);
  const hash =
    payload.hash ?? (text ? hashProCorpusSourceText(text) : payload.len > 0 ? `len:${payload.len}` : "");
  if (
    !shouldLogPaidProAuthoritySurfaceEvent({
      event: "pro-corpus-source-map",
      surface: payload.stage,
      hash,
      source: payload.source,
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[pro-corpus-source-map]", {
    stage: payload.stage,
    source: payload.source,
    len: payload.len,
    hash,
    allowedToOverride: payload.allowedToOverride,
    reason: payload.reason,
  });
}

/** True when pipeline/source indicates an accepted server full draft that must not be rewritten. */
export function shouldPreserveAcceptedServerFullDraftText(args: {
  text: string;
  pipelineSource?: string | null;
  source?: string | null;
  minLen?: number;
}): boolean {
  const len = trim(args.text).length;
  const minLen = args.minLen ?? AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN;
  if (len < minLen) return false;
  const pipe = trim(args.pipelineSource);
  if (isAuthoritativePremiumPipelineRenderSource(pipe)) return true;
  const src = trim(args.source);
  return src === "server_full_document_text" || src === "accepted_server_full_draft";
}

export function logProCorpusAuthorityDrift(payload: ProCorpusAuthorityDriftPayload): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    throw new Error(
      `[pro-corpus-authority-drift] ${payload.surface} ${payload.source} display=${payload.displayLen} authoritative=${payload.authoritativeLen}`,
    );
  }
  // eslint-disable-next-line no-console
  console.error("[pro-corpus-authority-drift]", payload);
}

export function logUserEditedAuthoritativeCorpus(payload: { oldHash: string; newHash: string }): void {
  // eslint-disable-next-line no-console
  console.info("[user-edited-authoritative-corpus]", payload);
}

/**
 * Block materially shorter display corpora unless the user explicitly edited the authoritative body.
 */
export function enforceAuthoritativeProCorpusDisplay(args: {
  authoritativeText: string;
  displayText: string;
  source: string;
  surface: string;
  userEdited?: boolean;
  minRatio?: number;
}): ProCorpusAuthorityDriftResult {
  const authoritative = trim(args.authoritativeText);
  const display = trim(args.displayText);
  if (!authoritative) {
    return { ok: true, blocked: false, displayText: display };
  }
  if (args.userEdited) {
    const oldHash = hashProCorpusSourceText(authoritative);
    const newHash = hashProCorpusSourceText(display);
    if (oldHash !== newHash) {
      logUserEditedAuthoritativeCorpus({ oldHash, newHash });
    }
    return { ok: true, blocked: false, displayText: display };
  }
  const authoritativeHash = hashProCorpusSourceText(authoritative);
  const displayHash = hashProCorpusSourceText(display);
  if (displayHash === authoritativeHash) {
    return { ok: true, blocked: false, displayText: display };
  }
  const ratio = args.minRatio ?? PRO_CORPUS_AUTHORITY_DRIFT_MIN_RATIO;
  const displayTooShort = display.length < authoritative.length * ratio;
  if (!displayTooShort) {
    return { ok: true, blocked: false, displayText: display };
  }
  const drift: ProCorpusAuthorityDriftPayload = {
    authoritativeLen: authoritative.length,
    displayLen: display.length,
    authoritativeHash,
    displayHash,
    source: args.source,
    surface: args.surface,
  };
  logProCorpusAuthorityDrift(drift);
  return { ok: false, blocked: true, displayText: authoritative, drift };
}
