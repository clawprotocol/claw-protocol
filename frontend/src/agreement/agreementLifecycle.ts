import type { AgreementReviewSection } from "../components/agreements/AgreementReview";
import { isSigningLockActive, loadBundle, type AgreementVersionBundle } from "./agreementVersionStore";
import type { AgreementDraft } from "./agreementTypes";
import type { WorkspaceIndexAgreement } from "./agreementWorkspaceApi";

export type AgreementLifecycle =
  | "draft"
  | "in_review"
  | "pending_signature"
  | "completed"
  | "archived";

/** Passed to {@link AgreementReview} for read-only completed/archived surfaces. */
export type AgreementWorkspaceEntryMode = "default" | "read_only_completed" | "read_only_archived";

/**
 * Agreement Creator document-preparation phases (intake through first successful server draft).
 * `draft_ready` is owned by the wizard shell after hydration or create — not the intake component.
 */
export type AgreementCreatorPrepState =
  | "intake"
  | "followup_required"
  | "generating"
  | "draft_ready"
  | "error";

export const lifecycleLabel: Record<AgreementLifecycle, string> = {
  draft: "Draft",
  in_review: "In review",
  pending_signature: "Pending signature",
  completed: "Completed",
  archived: "Archived",
};

export function deriveLifecycle(
  row: WorkspaceIndexAgreement,
  bundle: AgreementVersionBundle | null
): AgreementLifecycle {
  if (row.workspace_archived_at) return "archived";
  if (row.completed_signed) return "completed";
  if (row.has_server_signing_lock || isSigningLockActive(bundle)) return "pending_signature";
  const reviewAt = bundle?.reviewSentAt || row.review_sent_at;
  const recipientEdited = Boolean(bundle?.versions?.some((v) => v.created_by === "recipient"));
  if (reviewAt || recipientEdited) return "in_review";
  return "draft";
}

/**
 * Normalize lifecycle before open/resume so routing never violates lock or completion state.
 */
export function normalizeLifecycleForOpen(
  row: WorkspaceIndexAgreement,
  bundle: AgreementVersionBundle | null
): AgreementLifecycle {
  let lc = deriveLifecycle(row, bundle);
  if (lc === "draft" && (row.has_server_signing_lock || isSigningLockActive(bundle))) {
    lc = "pending_signature";
  }
  if (lc === "in_review" && row.completed_signed) {
    lc = "completed";
  }
  if (lc === "pending_signature" && row.completed_signed) {
    lc = "completed";
  }
  return lc;
}

export function bundleForWorkspaceRow(agreementId: string): AgreementVersionBundle | null {
  return loadBundle(agreementId);
}

/** Whether a draft has enough substance to open on the review/draft step instead of details. */
export function draftHasMeaningfulProgress(
  row: WorkspaceIndexAgreement,
  bundle: AgreementVersionBundle | null
): boolean {
  const title = (row.title || "").trim();
  if (title && title !== "Untitled agreement") return true;
  if (row.party_count > 0) return true;
  if ((bundle?.versions?.length ?? 0) > 0) return true;
  return false;
}

/**
 * Prefer hydrated server draft over index row when deciding default step (avoids opening Review
 * when the workspace index is ahead of an empty local bundle / thin draft).
 */
export function draftHasMeaningfulProgressFromServer(
  row: WorkspaceIndexAgreement,
  bundle: AgreementVersionBundle | null,
  draft: AgreementDraft | null
): boolean {
  if (draft) {
    const title = (draft.title || "").trim();
    if (title && title !== "Untitled agreement") return true;
    if ((draft.parties || []).length >= 2) return true;
    if ((draft.purpose || "").trim() && (draft.payment_terms || "").trim()) return true;
  }
  return draftHasMeaningfulProgress(row, bundle);
}

export type AgreementEntryRoute = {
  step: number;
  section: AgreementReviewSection;
  entryMode: AgreementWorkspaceEntryMode;
  /** When set, only these step indices are available in the stepper (lifecycle safety). */
  allowedSteps: number[] | null;
};

/**
 * Single place for “open saved agreement” routing: step, AgreementReview mode, and stepper locks.
 */
export function resolveAgreementEntryRoute(
  row: WorkspaceIndexAgreement,
  bundle: AgreementVersionBundle | null,
  lifecycle: AgreementLifecycle,
  opts?: { hydratedDraft?: AgreementDraft | null }
): AgreementEntryRoute {
  if (row.workspace_archived_at || lifecycle === "archived") {
    return {
      step: 4,
      section: "finalize",
      entryMode: "read_only_archived",
      allowedSteps: [4],
    };
  }

  switch (lifecycle) {
    case "completed":
      return {
        step: 4,
        section: "finalize",
        entryMode: "read_only_completed",
        allowedSteps: [2, 4],
      };
    case "pending_signature":
      return {
        step: 4,
        section: "finalize",
        entryMode: "default",
        allowedSteps: [4],
      };
    case "in_review":
      return {
        step: 2,
        section: "draft",
        entryMode: "default",
        allowedSteps: null,
      };
    case "draft":
    default: {
      const hasProgress = draftHasMeaningfulProgressFromServer(
        row,
        bundle,
        opts?.hydratedDraft ?? null
      );
      if (hasProgress) {
        return { step: 2, section: "draft", entryMode: "default", allowedSteps: null };
      }
      return { step: 1, section: "details", entryMode: "default", allowedSteps: null };
    }
  }
}

/**
 * If routing inputs are inconsistent, fall back to a safe review surface (negotiation/draft step).
 */
export function resolveAgreementEntryRouteWithFallback(
  row: WorkspaceIndexAgreement,
  bundle: AgreementVersionBundle | null,
  lifecycle: AgreementLifecycle,
  opts?: { hydratedDraft?: AgreementDraft | null }
): AgreementEntryRoute {
  try {
    const route = resolveAgreementEntryRoute(row, bundle, lifecycle, opts);
    if (route.step < 0 || route.step > 4) throw new Error("bad_step");
    return route;
  } catch {
    return {
      step: 1,
      section: "details",
      entryMode: "default",
      allowedSteps: null,
    };
  }
}

/** If review step is unsafe without versions + meaningful draft, fall back to details. */
export function clampAgreementWizardStepAfterHydrate(
  route: AgreementEntryRoute,
  draft: AgreementDraft | null,
  bundle: AgreementVersionBundle | null
): AgreementEntryRoute {
  if (route.step !== 2 || route.section !== "draft") return route;
  if (!draft?.id) {
    return { step: 1, section: "details", entryMode: route.entryMode, allowedSteps: route.allowedSteps };
  }
  const hasVersions = (bundle?.versions?.length ?? 0) > 0;
  const thin =
    (!(draft.title || "").trim() || (draft.title || "").trim() === "Untitled agreement") &&
    (draft.parties || []).length < 2;
  if (!hasVersions && thin) {
    return { step: 1, section: "details", entryMode: route.entryMode, allowedSteps: route.allowedSteps };
  }
  return route;
}

export function primaryCtaForLifecycle(lc: AgreementLifecycle): string {
  switch (lc) {
    case "draft":
      return "Resume";
    case "in_review":
      return "Review";
    case "pending_signature":
      return "View status";
    case "completed":
      return "View";
    case "archived":
      return "View";
    default:
      return "View";
  }
}
