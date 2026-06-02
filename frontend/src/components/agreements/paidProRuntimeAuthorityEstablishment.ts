/**
 * Runtime paid Pro authority — stricter than checkout/session flags.
 * Pro review shell, CTAs, send handoff, and VS01 must not activate until a real
 * server or frozen authoritative corpus exists (never live preview alone).
 */

import type { AgreementDraft } from "../../agreement/agreementTypes";
import { getAuthoritativeAgreementText } from "./authoritativeAgreementDocument";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { isForbiddenPaidProDisplayRenderSource } from "./premiumGenerationApiAvailability";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  hasMaterialPremiumPipelineCorpus,
  materialPremiumPipelineCorpusMaxLen,
  PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN,
} from "./paidProAuthorityConstants";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolvePaidProPostCheckoutRecoveryDisplayPlain } from "./paidProPostCheckoutRenderGate";

export { PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

export type PaidProRuntimeAuthorityReason =
  | "paid_pro_source_of_truth"
  | "authoritative_agreement_document"
  | "server_full_document_on_draft"
  | "post_checkout_local_recovery_display"
  | "awaiting_server_full_document"
  | "live_preview_blocked"
  | "forbidden_render_source"
  | "empty_corpus"
  | "false_authority_label";

export type PaidProRuntimeAuthorityAssessment = {
  established: boolean;
  canRenderProReviewShell: boolean;
  canShowProCtas: boolean;
  showFinalizingOnly: boolean;
  corpusLen: number;
  serverFullDocExists: boolean;
  hasPaidProSourceOfTruth: boolean;
  renderSource: string | null;
  reason: PaidProRuntimeAuthorityReason;
  falseAuthorityLabel: boolean;
};

export type DraftServerFullProbe = Partial<
  Pick<
    AgreementDraft,
    | "server_full_document_text"
    | "premium_server_full_document_text"
    | "premium_full_document_text"
    | "premium_render_source"
  >
>;

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function draftServerFullDocumentExists(draft: DraftServerFullProbe | null | undefined): boolean {
  if (!draft) return false;
  const len = materialPremiumPipelineCorpusMaxLen(draft);
  if (len >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) return true;
  const rs = trim(draft.premium_render_source);
  return isAuthoritativePremiumPipelineRenderSource(rs);
}

export function resolvePaidProRuntimeRenderSource(args: {
  draft?: DraftServerFullProbe | null;
  premiumRenderSourceResolved?: string | null;
  premiumPipelineSource?: string | null;
}): string | null {
  const fromDraft = trim(args.draft?.premium_render_source);
  const resolved = trim(args.premiumRenderSourceResolved);
  const pipeline = trim(args.premiumPipelineSource);
  return resolved || fromDraft || pipeline || null;
}

export function isFalsePaidProAuthoritySourceLabel(args: {
  source: string | null | undefined;
  corpusLen: number;
  hasPaidProSourceOfTruth?: boolean;
}): boolean {
  const source = trim(args.source);
  const len = args.corpusLen;
  if (len >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) return false;
  if (
    source === "paidProSourceOfTruth" ||
    source === "paid_pro_review_surface" ||
    source === "paid_pro_display_surface" ||
    source === "authoritativeAgreementDocument" ||
    source === "authoritative_hydrated" ||
    source === "server_full_document_text"
  ) {
    return true;
  }
  if (args.hasPaidProSourceOfTruth && len < PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) return true;
  return false;
}

export function logFalseProAuthorityBlocked(payload: {
  source: string | null;
  corpusLen: number;
  renderSource?: string | null;
  surface?: string;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.error("[false-pro-authority-blocked]", {
    source: payload.source,
    corpusLen: payload.corpusLen,
    renderSource: payload.renderSource ?? null,
    surface: payload.surface ?? null,
  });
}

export function assessPaidProRuntimeAuthority(args: {
  draft?: DraftServerFullProbe | null;
  premiumRenderSourceResolved?: string | null;
  premiumPipelineSource?: string | null;
  /** Declared corpus source for dev false-authority detection. */
  declaredCorpusSource?: string | null;
  intakeText?: string | null;
  postCheckoutRecoveryPlain?: string | null;
}): PaidProRuntimeAuthorityAssessment {
  const paidTruthText = getPaidProSourceOfTruthText();
  const authoritativeText = getAuthoritativeAgreementText();
  const paidEstablished = hasPaidProSourceOfTruth();
  const serverFullDocExists = draftServerFullDocumentExists(args.draft ?? null);
  const renderSource = resolvePaidProRuntimeRenderSource(args);
  const recoveryPlain =
    (args.postCheckoutRecoveryPlain || "").trim() ||
    resolvePaidProPostCheckoutRecoveryDisplayPlain({
      draft: args.draft as ParsedDraftShape | null,
      intakeText: args.intakeText,
      premiumRenderSource: args.premiumPipelineSource ?? args.premiumRenderSourceResolved,
    });
  const corpusLen = Math.max(
    paidTruthText.length,
    authoritativeText.length,
    recoveryPlain.length,
    materialPremiumPipelineCorpusMaxLen(args.draft ?? null),
  );
  const forbiddenRender = isForbiddenPaidProDisplayRenderSource(renderSource);
  const livePreviewOnly =
    renderSource === "live_generated_preview" && !paidEstablished && !serverFullDocExists;

  let reason: PaidProRuntimeAuthorityReason = "awaiting_server_full_document";
  let established = false;

  if (forbiddenRender || livePreviewOnly) {
    reason = forbiddenRender ? "forbidden_render_source" : "live_preview_blocked";
  } else if (paidEstablished && paidTruthText.length >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
    established = true;
    reason = "paid_pro_source_of_truth";
  } else if (authoritativeText.length >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
    established = true;
    reason = "authoritative_agreement_document";
  } else if (serverFullDocExists && corpusLen >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
    established = true;
    reason = "server_full_document_on_draft";
  } else if (!paidEstablished && recoveryPlain.length >= PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
    established = true;
    reason = "post_checkout_local_recovery_display";
  } else if (corpusLen > 0 && corpusLen < PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN) {
    reason = "empty_corpus";
  }

  const declaredSource = trim(args.declaredCorpusSource);
  const falseAuthorityLabel = isFalsePaidProAuthoritySourceLabel({
    source: declaredSource || (established ? reason : null),
    corpusLen,
    hasPaidProSourceOfTruth: paidEstablished,
  });
  if (falseAuthorityLabel) {
    logFalseProAuthorityBlocked({
      source: declaredSource || reason,
      corpusLen,
      renderSource,
      surface: "paid_pro_runtime_authority",
    });
    reason = "false_authority_label";
    established = false;
  }

  const canRenderProReviewShell = established;
  const canShowProCtas = established;
  const showFinalizingOnly = !established;

  return {
    established,
    canRenderProReviewShell,
    canShowProCtas,
    showFinalizingOnly,
    corpusLen,
    serverFullDocExists,
    hasPaidProSourceOfTruth: paidEstablished,
    renderSource,
    reason,
    falseAuthorityLabel,
  };
}

/** Premium / paid routes must never hand off `purpose` blobs. */
export function assertPremiumPurposeHandoffBlocked(args: {
  draft?: DraftServerFullProbe | null;
  field: string;
  text: string;
  surface: string;
}): void {
  const field = trim(args.field);
  const text = trim(args.text);
  const draft = args.draft ?? null;
  const premiumish =
    hasPaidProSourceOfTruth() ||
    Boolean(trim(draft?.premium_render_source)) ||
    hasMaterialPremiumPipelineCorpus(draft);
  if (!premiumish || field !== "purpose") return;

  const payload = {
    surface: args.surface,
    field,
    len: text.length,
    hash: text ? fingerprintAgreementBody(text) : null,
    premium_render_source: trim(draft?.premium_render_source) || null,
  };

  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    throw new Error(`[premium-purpose-handoff-blocked] ${JSON.stringify(payload)}`);
  }
  // eslint-disable-next-line no-console
  console.error("[premium-purpose-handoff-blocked]", payload);
}

export function normalizePaidProCorpusSourceLabel(args: {
  source: string;
  corpusLen: number;
}): string {
  if (isFalsePaidProAuthoritySourceLabel({ source: args.source, corpusLen: args.corpusLen })) {
    return "awaiting_authoritative_pro";
  }
  return args.source;
}

export type ParsedDraftLike = ParsedDraftShape &
  Partial<Pick<AgreementDraft, "premium_render_source" | "server_full_document_text" | "premium_server_full_document_text">>;
