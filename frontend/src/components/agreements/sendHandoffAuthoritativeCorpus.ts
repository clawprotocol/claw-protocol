import type { AgreementDraft } from "../../agreement/agreementTypes";
import { stripPlaceholderBlockerFromPersistPlain } from "./agreementPreviewPlaceholderTransientGate";
import { corpusHasVisibleSignatureExecutionLines } from "./guidedDealCompletion/signatureRegion";
import { resolvePaidProAgreementAuthoritative } from "./paidProAgreementAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { escapeHtml } from "./premiumAgreementDocumentHtml";
import { getAcceptedPremiumCanonicalText } from "./acceptedPremiumCanonicalCorpus";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";
import { getPaidProDocumentForSurface, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import { shouldPreserveAcceptedServerFullDraftText } from "./proCorpusSourcePath";
import { requireAuthoritativeCorpusForSurface } from "./authoritativeAgreementDocument";
import { logLawdogOutputPathMap } from "./lawdogOutputPathMap";
import {
  hasMaterialPremiumPipelineCorpus,
  materialPremiumPipelineCorpusMaxLen,
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
} from "./paidProAuthorityConstants";
import {
  assertPremiumPurposeHandoffBlocked,
  draftServerFullDocumentExists,
} from "./paidProRuntimeAuthorityEstablishment";
import { shouldSuppressPaidProCorpusRenderForRejectedPipeline } from "./paidProApiFailureAuthorityGuard";

export {
  hasMaterialPremiumPipelineCorpus,
  materialPremiumPipelineCorpusMaxLen,
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
} from "./paidProAuthorityConstants";

export type SendHandoffCorpusPick = {
  /** Which draft field supplied the winning text (for DEV traces). */
  field:
    | "premium_full_document_text"
    | "premium_server_full_document_text"
    | "server_full_document_text"
    | "document_text"
    | "rendered_document_text"
    | "purpose";
  text: string;
};

type CorpusDraftLike = Partial<
  Pick<
    AgreementDraft,
    | "premium_render_source"
    | "purpose"
    | "premium_full_document_text"
    | "premium_server_full_document_text"
    | "server_full_document_text"
    | "document_text"
    | "rendered_document_text"
    | "parties"
  >
>;

function canonicalPartyNamesFromDraft(draft: CorpusDraftLike | null | undefined): string[] {
  return (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((name) => name.length >= 2)
    .slice(0, 2);
}

function canonicalizeHandoffCorpus(text: string, draft: CorpusDraftLike | null | undefined): string {
  const trimmed = (text || "").trim();
  if (
    shouldPreserveAcceptedServerFullDraftText({
      text: trimmed,
      source: String(draft?.premium_render_source ?? "server_full_document_text"),
    })
  ) {
    return trimmed;
  }
  return canonicalizeProAgreementText(trimmed, {
    canonicalPartyNames: canonicalPartyNamesFromDraft(draft),
    canonicalRoles: ["Client", "Service Provider"],
  }).text;
}

/** DEV / routing: explains paid-Pro send modal bypass for `/app/send`. */
export type PaidProSendBranchMeta = {
  bypass: boolean;
  /** Explicit alias for send gating — true when paid Pro / authoritative corpus bypasses the conversion upsell. */
  paidProSendAllowed: boolean;
  premium_render_source: string | null;
  authoritativeLen: number;
  /** Max length among premium / server pipeline body fields (same basis as `hasMaterialPremiumPipelineCorpus`). */
  materialPremiumCorpusLen: number;
  hasMaterialPremiumPipelineCorpus: boolean;
  reason: string;
};

/** Prefer longest authoritative full-text field for `/app/send` and persist handoff. */
/**
 * RECIPIENTS / send setup: hide structured summary + v1 advanced accordions when the user already has a
 * full Pro/agreement body (not a thin summary / purpose-only blob).
 */
const AUTHORITATIVE_PREMIUM_RENDER_SOURCES = new Set(["server_full_document_text", "server_repair_document_text"]);

/**
 * After GET hydrate / resume, keep the user on paid Pro **review** chrome (not fresh intake) when the
 * persisted draft is clearly authoritative: server repair/full render source or material premium corpus.
 */
export function shouldKeepReviewDisplayAfterProHydrate(draft: CorpusDraftLike | null | undefined): boolean {
  return resolvePaidProAgreementAuthoritative({ draft: draft ?? null }).authoritative;
}

export function shouldMinimalProSendRecipientChrome(args: {
  premiumRenderSourceResolved?: string | null;
  authoritativePick: SendHandoffCorpusPick | null;
  readonlyPlainText: string;
  /** When set, long premium/server corpora bypass purpose-only false negatives (mis-ordered draft fields). */
  draft?: CorpusDraftLike | null;
}): boolean {
  const rs = String(args.premiumRenderSourceResolved ?? "").trim();
  if (AUTHORITATIVE_PREMIUM_RENDER_SOURCES.has(rs)) return true;
  if (args.draft && hasMaterialPremiumPipelineCorpus(args.draft)) return true;
  const plainLen = String(args.readonlyPlainText ?? "").trim().length;
  if (plainLen < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return false;
  const pick = args.authoritativePick;
  if (pick && pick.field === "purpose") return false;
  return true;
}

/**
 * `/app/send`: structured bypass decision + DEV telemetry for SendConversionModal routing.
 */
export function describePaidProSendModalBranch(
  draft: CorpusDraftLike | null | undefined,
  opts?: { agreementId?: string | null },
): PaidProSendBranchMeta {
  const authority = resolvePaidProAgreementAuthoritative({ draft: draft ?? null, agreementId: opts?.agreementId });
  if (authority.authoritative) {
    const pick = pickAuthoritativePlainForSendHandoff(draft);
    const meta: PaidProSendBranchMeta = {
      bypass: true,
      paidProSendAllowed: true,
      premium_render_source: authority.premium_render_source,
      authoritativeLen: (pick?.text ?? "").trim().length,
      materialPremiumCorpusLen: materialPremiumPipelineCorpusMaxLen(draft),
      hasMaterialPremiumPipelineCorpus: hasMaterialPremiumPipelineCorpus(draft),
      reason: authority.reason,
    };
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.info("[paid-pro-authority]", {
        agreementId: opts?.agreementId ?? null,
        authoritative: true,
        reason: authority.reason,
        corpusLen: authority.corpusLen,
        renderSource: authority.premium_render_source,
        sessionPaid: authority.reason === "paid_premium_completion_session",
      });
    }
    return meta;
  }
  const rs = String(draft?.premium_render_source ?? "").trim();
  const materialPremiumCorpusLen = materialPremiumPipelineCorpusMaxLen(draft);
  const hasMaterialPremiumPipelineCorpusFlag = hasMaterialPremiumPipelineCorpus(draft);
  const pick = pickAuthoritativePlainForSendHandoff(draft);
  const plain = (pick?.text ?? "").trim();
  const bypass = shouldMinimalProSendRecipientChrome({
    premiumRenderSourceResolved: rs || undefined,
    authoritativePick: pick,
    readonlyPlainText: plain,
    draft,
  });
  let reason: string;
  if (bypass) {
    if (AUTHORITATIVE_PREMIUM_RENDER_SOURCES.has(rs)) reason = "server_render_source";
    else if (pick && pick.field !== "purpose") reason = "corpus_authoritative";
    else reason = "authoritative_edge";
  } else if (pick?.field === "purpose" && plain.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    reason = "purpose_only_long";
  } else {
    reason = "thin_or_preview";
  }
  return {
    bypass,
    paidProSendAllowed: bypass,
    premium_render_source: rs || null,
    authoritativeLen: plain.length,
    materialPremiumCorpusLen,
    hasMaterialPremiumPipelineCorpus: hasMaterialPremiumPipelineCorpusFlag,
    reason,
  };
}

/** Single gate for `/app/send`: skip “Unlock professional send” when user already has paid / authoritative Pro text. */
export function paidProSendAllowed(draft: CorpusDraftLike | null | undefined): boolean {
  return describePaidProSendModalBranch(draft).paidProSendAllowed;
}

/**
 * `/app/send` and related flows: skip subscription upgrade modal when paid Pro body is already authoritative.
 */
export function authoritativeProBypassSimpleSendPaywall(draft: CorpusDraftLike | null | undefined): boolean {
  return describePaidProSendModalBranch(draft).bypass;
}

/** After GET + primed merge: prefer server hint when either side carries it (Railway QA gap). */
export function mergePremiumRenderSourceField(
  primed: string | null | undefined,
  fetched: string | null | undefined,
): string | null {
  const sa = String(primed ?? "").trim();
  const sb = String(fetched ?? "").trim();
  if (sa === "server_full_document_text" || sb === "server_full_document_text") return "server_full_document_text";
  if (sb) return sb;
  if (sa) return sa;
  return null;
}

/**
 * `/app/send` watermark gate: deterministic from draft + economics tier — not intake/displayPhase.
 * When economics still says `free` after paid hydrate, draft corpus + render source must win.
 */
export function bypassSimpleHomeWatermarkSendGate(
  draft: CorpusDraftLike | null | undefined,
  economics: { tier?: string | null } | null | undefined,
): boolean {
  if (!draft) return false;
  const tier = String(economics?.tier ?? "").trim().toLowerCase();
  if (tier === "paid") return true;
  return describePaidProSendModalBranch(draft).bypass;
}

export function pickAuthoritativePlainForSendHandoff(draft: CorpusDraftLike | null | undefined): SendHandoffCorpusPick | null {
  const canonical = readCanonicalAgreementCorpusForSurface("handoff");
  if (canonical) {
    return { field: "premium_server_full_document_text", text: canonical.canonicalText };
  }
  const paidPro = getPaidProDocumentForSurface("signer_setup");
  if (paidPro) {
    return { field: "premium_server_full_document_text", text: paidPro.text };
  }
  const acceptedCanonical = getAcceptedPremiumCanonicalText();
  if (acceptedCanonical.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    return { field: "premium_server_full_document_text", text: acceptedCanonical };
  }
  if (!draft) return null;
  if (shouldSuppressPaidProCorpusRenderForRejectedPipeline({ draft })) {
    return null;
  }
  const premiumish =
    Boolean(String(draft.premium_render_source ?? "").trim()) ||
    hasMaterialPremiumPipelineCorpus(draft);
  const candidates: [SendHandoffCorpusPick["field"], string][] = [
    ["premium_full_document_text", String(draft.premium_full_document_text ?? "").trim()],
    ["premium_server_full_document_text", String(draft.premium_server_full_document_text ?? "").trim()],
    ["server_full_document_text", String(draft.server_full_document_text ?? "").trim()],
    ["document_text", String(draft.document_text ?? "").trim()],
    ["rendered_document_text", String(draft.rendered_document_text ?? "").trim()],
    ["purpose", String(draft.purpose ?? "").trim()],
  ];
  const nonPurpose = candidates.filter(([f]) => f !== "purpose");
  let best: SendHandoffCorpusPick | null = null;
  for (const [field, text] of nonPurpose) {
    if (text.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN && (!best || text.length > best.text.length)) {
      best = { field, text: premiumish ? text : canonicalizeHandoffCorpus(text, draft) };
    }
  }
  if (best) {
    logLawdogOutputPathMap({
      stage: "send_handoff",
      source: best.field,
      text: best.text,
      canMutateBody: !premiumish,
      canRejectBody: true,
      canFallback: false,
      reason: premiumish ? "premium_nonpurpose_authoritative" : "free_nonpurpose_handoff",
    });
    return best;
  }
  if (premiumish) {
    requireAuthoritativeCorpusForSurface({
      surface: "send_route",
      source: "send_handoff_no_authoritative_corpus",
      renderedText: String(draft.purpose ?? "").trim(),
      paidProAccepted: true,
      minLen: SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
    });
    return null;
  }
  for (const [field, text] of candidates) {
    if (text.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN && (!best || text.length > best.text.length)) {
      best = { field, text: canonicalizeHandoffCorpus(text, draft) };
    }
  }
  if (best) return best;
  const premiumRoute =
    premiumish ||
    hasPaidProSourceOfTruth() ||
    draftServerFullDocumentExists(draft);
  if (premiumRoute) {
    assertPremiumPurposeHandoffBlocked({
      draft,
      field: "purpose",
      text: String(draft.purpose ?? "").trim(),
      surface: "send_handoff_premium_no_authoritative_corpus",
    });
    return null;
  }
  for (const [field, text] of candidates) {
    if (field === "purpose") continue;
    if (text.length > 0 && (!best || text.length > best.text.length)) {
      best = { field, text: canonicalizeHandoffCorpus(text, draft) };
    }
  }
  if (best) {
    logLawdogOutputPathMap({
      stage: "send_handoff",
      source: best.field,
      text: best.text,
      canMutateBody: true,
      canRejectBody: false,
      canFallback: false,
      reason: "free_nonpurpose_handoff",
    });
  }
  return best;
}

/** Single `purpose` blob for POST/PATCH — longest among premium corpora, editor, and structured purpose. */
export function longestPlainForAgreementPersist(
  merged: ParsedDraftShape,
  agreementEditorPlain: string | null | undefined,
): string {
  const candidates = [
    String(merged.premium_full_document_text ?? "").trim(),
    String(merged.premium_server_full_document_text ?? "").trim(),
    String(merged.premium_server_repair_document_text ?? "").trim(),
    stripPlaceholderBlockerFromPersistPlain(String(agreementEditorPlain ?? "").trim()),
    String(merged.purpose ?? "").trim(),
  ].filter(Boolean);
  if (candidates.length === 0) return "";
  return canonicalizeHandoffCorpus(candidates.reduce((a, b) => (b.length > a.length ? b : a)), merged);
}

export type BuildSendRouteReadonlyHtmlOpts = {
  /**
   * Centered label above the body. Default: draft disclaimer for free/starter.
   * Pass `"Agreement preview"` for paid authoritative send handoff, or `null` to omit the label row.
   */
  documentLabel?: string | null;
};

export function buildSendRouteReadonlyHtmlFromPlain(
  plain: string,
  opts?: BuildSendRouteReadonlyHtmlOpts,
): string {
  const body = escapeHtml(plain.trim());
  const label =
    opts?.documentLabel === undefined ? "Draft Agreement (non-binding template)" : opts.documentLabel;
  const labelBlock =
    label === null
      ? ""
      : "<p style='text-align:center;color:#475569;font-size:12px;margin-bottom:12px'>" +
        escapeHtml(label) +
        "</p>";
  const executionNoteBlock = corpusHasVisibleSignatureExecutionLines(plain.trim())
    ? ""
    : "<p style='margin-top:18px;font-size:12px;color:#475569;text-align:center'>" +
      "Execution and signature placement are handled in the electronic signing step." +
      "</p>";
  return (
    "<article style='position:relative;max-width:720px;margin:0 auto'>" +
    labelBlock +
    "<pre style='white-space:pre-wrap;font-family:Georgia,serif;font-size:15px;line-height:1.65;" +
    "color:#0f172a;margin:0;padding:0;border:0;background:transparent'>" +
    body +
    "</pre>" +
    executionNoteBlock +
    "</article>"
  );
}
