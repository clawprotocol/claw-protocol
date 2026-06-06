import type { PremiumSendIntent } from "../../launch/simpleProduct/premiumSendIntent";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const COLLAB_FIRST_SESSION_KEY = "claw_premium_fork_default_collaborate_v1";
const USER_PICKED_SEND_MODE_KEY = "claw_premium_fork_user_send_mode_v1";

/** Persist collaborate vs. signature after the user picks (survives refresh until cleared). */
export function persistPremiumForkUserSendMode(mode: PremiumSendIntent): void {
  try {
    sessionStorage.setItem(USER_PICKED_SEND_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function peekPremiumForkUserSendMode(): PremiumSendIntent | null {
  try {
    const v = sessionStorage.getItem(USER_PICKED_SEND_MODE_KEY);
    if (v === "review" || v === "signature") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearPremiumForkUserSendMode(): void {
  try {
    sessionStorage.removeItem(USER_PICKED_SEND_MODE_KEY);
  } catch {
    /* ignore */
  }
}

/** After premium rewrite / snapshot apply, bias the fork toward collaboration until the user picks a path. */
export function primePremiumCollaborateFirstDefault(): void {
  try {
    sessionStorage.setItem(COLLAB_FIRST_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function peekPremiumCollaborateFirstDefaultPrimed(): boolean {
  try {
    return sessionStorage.getItem(COLLAB_FIRST_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPremiumCollaborateFirstDefaultPrimed(): void {
  try {
    sessionStorage.removeItem(COLLAB_FIRST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function agreementTextSuggestsNegotiation(agreementDocumentText: string, intakeCombined: string): boolean {
  const blob = `${agreementDocumentText || ""}\n${intakeCombined || ""}`;
  return /\b(back[- ]?and[- ]?forth|negotiat(?:e|ions?|ing)?|subject to review|fine[- ]?tune|finalize together|revise together|terms? (?:are|is) still|discuss|redline|comment thread|work in progress|\bwip\b|not final|draft terms)\b/i.test(
    blob,
  );
}

export type InferPremiumDefaultSendModeInput = {
  draft: ParsedDraftShape | null;
  agreementDocDirty: boolean;
  agreementDocumentText: string;
  intakeCombined: string;
  hasRecipientsReady: boolean;
  suggestCollaboratePrimed: boolean;
  getDraftFirstReviewBlocker: (d: ParsedDraftShape) => string | null;
};

/** Default fork selection before the user touches the premium send cards. */
export function inferPremiumDefaultSendMode(input: InferPremiumDefaultSendModeInput): PremiumSendIntent {
  const {
    draft,
    agreementDocDirty,
    agreementDocumentText,
    intakeCombined,
    hasRecipientsReady,
    suggestCollaboratePrimed,
    getDraftFirstReviewBlocker,
  } = input;
  if (!draft) return "signature";
  if (getDraftFirstReviewBlocker(draft)) return "review";
  if (agreementDocDirty) return "review";
  if (agreementTextSuggestsNegotiation(agreementDocumentText, intakeCombined)) return "review";
  if (suggestCollaboratePrimed) return "review";

  void hasRecipientsReady;
  /** Product default: review-first for paid Pro send progression (user may still pick signature explicitly). */
  return "review";
}
