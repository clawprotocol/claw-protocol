/**
 * After-pay persist resume: Stripe metadata.agreement_id is authority after verify 200.
 * Last-good create-flow then GET/resumes that persist and runs Pro generation on it.
 * SessionStorage resume is optional — a return tab has none.
 */

import { fetchAgreementDraft } from "../agreement/agreementWorkspaceApi";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  isRealCheckoutAgreementId,
  PRE_AUTH_CHECKOUT_AGREEMENT_STORAGE_KEY,
} from "../auth/preAuthCheckoutAgreement";
import { stashCreateComplexityResume } from "../components/agreements/agreementCreateComplexityResume";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { extractIntakePayment } from "../components/agreements/intakeCurrencyParse";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { writeOriginalUserIntakeRawIfRicher } from "../components/agreements/originalUserIntakeRawStorage";
import { buildReviewCoercionRawIntakeFromDraft } from "../components/agreements/premiumCheckoutRawIntake";
import { mergePaidProAuthoritativeDraftFieldsFromApi } from "./simpleProduct/paidProResumeDraftMerge";

export function readVerifiedAfterPayAgreementId(verified: {
  agreement_id?: string | null;
}): string | null {
  const id = (verified.agreement_id || "").trim();
  return isRealCheckoutAgreementId(id) ? id : null;
}

/** Bind the paid persist into last-good resume/pre-auth slots. Verified ID wins. */
export function bindAfterPayPersistAgreementId(agreementId: string): string | null {
  const id = agreementId.trim();
  if (!isRealCheckoutAgreementId(id)) return null;
  writeCreateReviewAgreementResumeId(id);
  try {
    sessionStorage.setItem(PRE_AUTH_CHECKOUT_AGREEMENT_STORAGE_KEY, id);
  } catch {
    /* ignore quota */
  }
  return id;
}

export function parsedDraftFromAfterPayPersist(apiDraft: AgreementDraft): ParsedDraftShape {
  const intakeHint = [apiDraft.title, apiDraft.purpose, apiDraft.payment_terms]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
  const base: ParsedDraftShape = {
    title: String(apiDraft.title ?? "").trim(),
    jurisdiction: String(apiDraft.jurisdiction ?? "").trim() || "TBD",
    parties: (apiDraft.parties ?? []).map((p) => ({
      id: p.id,
      name: String(p.name ?? "").trim(),
      role: String(p.role ?? "party").trim() || "party",
      email: String(p.email ?? "").trim() || undefined,
    })),
    purpose: String(apiDraft.purpose ?? "").trim(),
    payment_terms: String(apiDraft.payment_terms ?? "").trim(),
    duration: apiDraft.duration ?? null,
    due_date: apiDraft.due_date ?? null,
    effective_date: apiDraft.effective_date ?? null,
    payment: extractIntakePayment(intakeHint),
  };
  return mergePaidProAuthoritativeDraftFieldsFromApi(base, apiDraft);
}

export type AfterPayPersistResume = {
  agreementId: string;
  prior: ParsedDraftShape;
  intake: string;
};

/**
 * GET /api/agreements/:id for the verified persist and seed last-good prior + intake.
 * Read-only — does not POST /draft or rewrite starter facts.
 */
export async function resumeAfterPayPersistForProGeneration(
  agreementId: string,
): Promise<AfterPayPersistResume | null> {
  const id = agreementId.trim();
  if (!isRealCheckoutAgreementId(id)) return null;
  const { ok, draft } = await fetchAgreementDraft(id, { partyNameContext: "Party" });
  if (!ok || !draft) return null;
  const prior = parsedDraftFromAfterPayPersist(draft);
  const intake =
    buildReviewCoercionRawIntakeFromDraft(prior, "") ||
    [draft.title, draft.purpose, draft.payment_terms]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
  if (!intake.trim() || !prior) return null;
  writeOriginalUserIntakeRawIfRicher(intake, 8);
  stashCreateComplexityResume({
    rawIntake: intake,
    pending: prior,
    awaitingProCheckout: false,
    originalUserIntakeRaw: intake,
  });
  return { agreementId: id, prior, intake };
}
