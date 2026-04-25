export const AGREEMENT_CREATOR_INTAKE_STORAGE_KEY = "claw_agreement_creator_intake_v1";

/** Session-only: production create flow agreement id for review/refine (survives refresh in-tab). */
export const AGREEMENT_CREATE_REVIEW_RESUME_KEY = "claw_agreement_create_review_resume_v1";

/** Session-only: agreement id whose draft was upgraded with full-draft expansion (API may omit `additional_terms`). */
export const AGREEMENT_CREATE_FULL_DRAFT_MARKER_KEY = "claw_agreement_create_full_draft_marker_v1";

export function readCreateReviewAgreementResumeId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const s = sessionStorage.getItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY)?.trim();
    return s && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

export function writeCreateReviewAgreementResumeId(agreementId: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (agreementId && agreementId.trim()) {
      sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, agreementId.trim());
    } else {
      sessionStorage.removeItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function readFullDraftUpgradeMarkerAgreementId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const s = sessionStorage.getItem(AGREEMENT_CREATE_FULL_DRAFT_MARKER_KEY)?.trim();
    return s && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

export function writeFullDraftUpgradeMarkerAgreementId(agreementId: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (agreementId && agreementId.trim()) {
      sessionStorage.setItem(AGREEMENT_CREATE_FULL_DRAFT_MARKER_KEY, agreementId.trim());
    } else {
      sessionStorage.removeItem(AGREEMENT_CREATE_FULL_DRAFT_MARKER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearCreateReviewAgreementResumeId(): void {
  writeCreateReviewAgreementResumeId(null);
  writeFullDraftUpgradeMarkerAgreementId(null);
}

export function readAgreementCreatorIntakeStorage(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function clearAgreementCreatorIntakeStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function writeAgreementCreatorIntakeStorage(text: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY, text);
  } catch {
    /* ignore */
  }
}

/**
 * Initial textarea value: explicit props from the active flow win over persisted draft.
 */
export function resolveIntakeBootstrap(
  initialIntakeText: string | undefined,
  persistedDraft: string,
): string {
  if (initialIntakeText !== undefined) return initialIntakeText;
  return persistedDraft;
}
