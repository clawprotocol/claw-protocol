import type { ParsedDraftShape } from "./intakeSmartDefaults";

/** Post-checkout pipeline / resolver pin for a committed full Pro body (see premiumCompletionStorage). */
export const PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE = "server_full_document_text";

/**
 * Minimum ratio of refined length vs baseline Pro length required to replace the document.
 * Prevents collapsed / partial model output (~15k → ~4k) from replacing the full agreement.
 */
export const PREMIUM_REFINE_MIN_LENGTH_RATIO = 0.82;

export type PremiumRefineCorpusSource =
  | "premium_full_document_text"
  | "premium_server_full_document_text"
  | "agreement_document_state"
  | "premium_readonly_plain"
  | "premium_snapshot_winner_plain"
  | "draft_purpose_fallback";

export type PremiumRefineCorpusPick = {
  text: string;
  chosenSource: PremiumRefineCorpusSource;
  len: number;
};

/**
 * Prefer the longest non-empty corpus among draft premium fields and live buffers so refine always
 * sends the full Pro agreement — never a short starter/live preview when draft holds the full body.
 */
export function pickAuthoritativeProCorpusForRefine(args: {
  draft: ParsedDraftShape | null;
  agreementDocumentText: string;
  premiumReadonlyPlain?: string;
  /** Session snapshot winner (often mirrors server_full_document_text). */
  premiumSnapshotWinnerPlain?: string;
}): PremiumRefineCorpusPick {
  const rows: { source: PremiumRefineCorpusSource; text: string }[] = [];
  const push = (source: PremiumRefineCorpusSource, raw: string | null | undefined) => {
    const t = (raw || "").trim();
    if (t.length > 0) rows.push({ source, text: t });
  };
  if (args.draft) {
    push("premium_full_document_text", args.draft.premium_full_document_text);
    push("premium_server_full_document_text", args.draft.premium_server_full_document_text);
  }
  push("agreement_document_state", args.agreementDocumentText);
  push("premium_readonly_plain", args.premiumReadonlyPlain);
  push("premium_snapshot_winner_plain", args.premiumSnapshotWinnerPlain);
  if (args.draft) push("draft_purpose_fallback", args.draft.purpose);

  if (rows.length === 0) return { text: "", chosenSource: "draft_purpose_fallback", len: 0 };

  let best = rows[0];
  for (const r of rows) {
    if (r.text.length > best.text.length) best = r;
  }
  return { text: best.text, chosenSource: best.source, len: best.text.length };
}

export type PremiumRefineApplyDecision = "accepted" | "rejected_short" | "rejected_empty";

export function evaluatePremiumRefineCandidate(
  currentProLen: number,
  refinedCandidate: string,
): {
  decision: PremiumRefineApplyDecision;
  refinedLen: number;
  ratio: number;
} {
  const refinedLen = refinedCandidate.trim().length;
  if (refinedLen < 1) return { decision: "rejected_empty", refinedLen, ratio: 0 };
  if (currentProLen < 1) return { decision: "accepted", refinedLen, ratio: 1 };

  const ratio = refinedLen / currentProLen;

  /** Short baseline agreements: allow modest trims but still block catastrophic collapse. */
  if (currentProLen < 2000) {
    if (refinedLen >= Math.max(500, Math.floor(currentProLen * 0.75))) {
      return { decision: "accepted", refinedLen, ratio };
    }
    if (ratio >= PREMIUM_REFINE_MIN_LENGTH_RATIO) return { decision: "accepted", refinedLen, ratio };
    return { decision: "rejected_short", refinedLen, ratio };
  }

  if (ratio >= PREMIUM_REFINE_MIN_LENGTH_RATIO) return { decision: "accepted", refinedLen, ratio };
  return { decision: "rejected_short", refinedLen, ratio };
}

/** Primary line: rejected_short near refine UI (inline). */
export const PRO_REFINE_REJECTED_SHORT_PRIMARY =
  "We couldn't safely apply that update without shortening your agreement. Your Pro agreement is unchanged.";

/** Secondary hint — optional line shown below the primary. */
export const PRO_REFINE_REJECTED_SHORT_HINT =
  "Try a more specific instruction, or use Edit wording for a precise manual change.";

/** Full inline message for textarea-adjacent alerts (two paragraphs). */
export function formatProRefineRejectedShortInline(): string {
  return `${PRO_REFINE_REJECTED_SHORT_PRIMARY}\n\n${PRO_REFINE_REJECTED_SHORT_HINT}`;
}

/** @deprecated Prefer {@link formatProRefineRejectedShortInline} or PRIMARY/HINT. */
export const PRO_REFINE_REJECTED_SHORT_USER_MESSAGE = PRO_REFINE_REJECTED_SHORT_PRIMARY;

/** Shown inline after a premium refine is accepted and applied. */
export const PRO_REFINE_CHANGE_APPLIED_USER_MESSAGE = "Change applied.";
