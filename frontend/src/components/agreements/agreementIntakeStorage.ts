export const AGREEMENT_CREATOR_INTAKE_STORAGE_KEY = "claw_agreement_creator_intake_v1";

/** Session-only: production create flow agreement id for review/refine (survives refresh in-tab). */
export const AGREEMENT_CREATE_REVIEW_RESUME_KEY = "claw_agreement_create_review_resume_v1";

/** Session-only: free/starter draft reached review-ready (survives refresh before agreement id is persisted). */
export const AGREEMENT_CREATE_REVIEW_DRAFT_READY_KEY = "claw_agreement_create_review_draft_ready_v1";

/** Session-only: structured draft snapshot for in-tab refresh restore (starter review). */
export const AGREEMENT_CREATE_REVIEW_DRAFT_SNAPSHOT_KEY = "claw_agreement_create_review_draft_snapshot_v1";

const REVIEW_DRAFT_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
  clearCreateReviewDraftReadyMarker();
}

export function readCreateReviewDraftReadyMarker(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(AGREEMENT_CREATE_REVIEW_DRAFT_READY_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCreateReviewDraftReadyMarker(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_DRAFT_READY_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearCreateReviewDraftReadyMarker(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(AGREEMENT_CREATE_REVIEW_DRAFT_READY_KEY);
    sessionStorage.removeItem(AGREEMENT_CREATE_REVIEW_DRAFT_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

type ReviewDraftSnapshotPayload = { v: 1; draft: unknown; ts: number };

export function writeCreateReviewDraftSnapshot(draft: unknown): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: ReviewDraftSnapshotPayload = { v: 1, draft, ts: Date.now() };
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_DRAFT_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readCreateReviewDraftSnapshot<T = unknown>(): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AGREEMENT_CREATE_REVIEW_DRAFT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewDraftSnapshotPayload;
    if (parsed?.v !== 1 || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > REVIEW_DRAFT_SNAPSHOT_MAX_AGE_MS) {
      sessionStorage.removeItem(AGREEMENT_CREATE_REVIEW_DRAFT_SNAPSHOT_KEY);
      return null;
    }
    return (parsed.draft as T) ?? null;
  } catch {
    return null;
  }
}

/** True when refresh should restore review instead of re-running home auto-generate. */
export function hasStoredCreateReviewState(): boolean {
  return Boolean(readCreateReviewAgreementResumeId()) || readCreateReviewDraftReadyMarker();
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
