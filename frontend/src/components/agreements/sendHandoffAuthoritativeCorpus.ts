import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { escapeHtml } from "./premiumAgreementDocumentHtml";

/** Minimum length to treat plain text as authoritative Pro/full-draft handoff (not starter stub). */
export const SEND_HANDOFF_AUTHORITATIVE_MIN_LEN = 500;

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
  >
>;

/** DEV / routing: explains paid-Pro send modal bypass for `/app/send`. */
export type PaidProSendBranchMeta = {
  bypass: boolean;
  premium_render_source: string | null;
  authoritativeLen: number;
  reason: string;
};

/** Prefer longest authoritative full-text field for `/app/send` and persist handoff. */
/**
 * RECIPIENTS / send setup: hide structured summary + v1 advanced accordions when the user already has a
 * full Pro/agreement body (not a thin summary / purpose-only blob).
 */
export function shouldMinimalProSendRecipientChrome(args: {
  premiumRenderSourceResolved?: string | null;
  authoritativePick: SendHandoffCorpusPick | null;
  readonlyPlainText: string;
}): boolean {
  const rs = String(args.premiumRenderSourceResolved ?? "").trim();
  if (rs === "server_full_document_text") return true;
  const plainLen = String(args.readonlyPlainText ?? "").trim().length;
  if (plainLen < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return false;
  const pick = args.authoritativePick;
  if (pick && pick.field === "purpose") return false;
  return true;
}

/**
 * `/app/send`: structured bypass decision + DEV telemetry for SendConversionModal routing.
 */
export function describePaidProSendModalBranch(draft: CorpusDraftLike | null | undefined): PaidProSendBranchMeta {
  const rs = String(draft?.premium_render_source ?? "").trim();
  const pick = pickAuthoritativePlainForSendHandoff(draft);
  const plain = (pick?.text ?? "").trim();
  const bypass = shouldMinimalProSendRecipientChrome({
    premiumRenderSourceResolved: rs || undefined,
    authoritativePick: pick,
    readonlyPlainText: plain,
  });
  let reason: string;
  if (bypass) {
    if (rs === "server_full_document_text") reason = "server_render_source";
    else if (pick && pick.field !== "purpose") reason = "corpus_authoritative";
    else reason = "authoritative_edge";
  } else if (pick?.field === "purpose" && plain.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    reason = "purpose_only_long";
  } else {
    reason = "thin_or_preview";
  }
  return {
    bypass,
    premium_render_source: rs || null,
    authoritativeLen: plain.length,
    reason,
  };
}

/**
 * `/app/send` and related flows: skip subscription upgrade modal when paid Pro body is already authoritative.
 */
export function authoritativeProBypassSimpleSendPaywall(draft: CorpusDraftLike | null | undefined): boolean {
  return describePaidProSendModalBranch(draft).bypass;
}

export function pickAuthoritativePlainForSendHandoff(draft: CorpusDraftLike | null | undefined): SendHandoffCorpusPick | null {
  if (!draft) return null;
  const candidates: [SendHandoffCorpusPick["field"], string][] = [
    ["premium_full_document_text", String(draft.premium_full_document_text ?? "").trim()],
    ["premium_server_full_document_text", String(draft.premium_server_full_document_text ?? "").trim()],
    ["server_full_document_text", String(draft.server_full_document_text ?? "").trim()],
    ["document_text", String(draft.document_text ?? "").trim()],
    ["rendered_document_text", String(draft.rendered_document_text ?? "").trim()],
    ["purpose", String(draft.purpose ?? "").trim()],
  ];
  let best: SendHandoffCorpusPick | null = null;
  for (const [field, text] of candidates) {
    if (text.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN && (!best || text.length > best.text.length)) {
      best = { field, text };
    }
  }
  if (best) return best;
  for (const [field, text] of candidates) {
    if (text.length > 0 && (!best || text.length > best.text.length)) {
      best = { field, text };
    }
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
    String(agreementEditorPlain ?? "").trim(),
    String(merged.purpose ?? "").trim(),
  ].filter(Boolean);
  if (candidates.length === 0) return "";
  return candidates.reduce((a, b) => (b.length > a.length ? b : a));
}

export function buildSendRouteReadonlyHtmlFromPlain(plain: string): string {
  const body = escapeHtml(plain.trim());
  return (
    "<article style='position:relative;max-width:720px;margin:0 auto'>" +
    "<p style='text-align:center;color:#475569;font-size:12px;margin-bottom:12px'>" +
    "Draft Agreement (non-binding template)</p>" +
    "<pre style='white-space:pre-wrap;font-family:Georgia,serif;font-size:15px;line-height:1.65;" +
    "color:#0f172a;margin:0;padding:0;border:0;background:transparent'>" +
    body +
    "</pre>" +
    "<p style='margin-top:18px;font-size:12px;color:#475569;text-align:center'>" +
    "Execution and signature placement are handled in the electronic signing step." +
    "</p>" +
    "</article>"
  );
}
