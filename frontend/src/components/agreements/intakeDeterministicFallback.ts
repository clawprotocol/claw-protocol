/**
 * When parse is thin or times out, fill key draft slots from deterministic patterns on raw intake.
 * Complements server parse — never overwrites non-empty substantive fields.
 */
import { explicitIntentCanonicalTitle } from "./canonicalAgreementTitle";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function looksLikePaymentPlanMisrouteTitle(t: string): boolean {
  return /^payment\s+plan\b/i.test((t || "").trim());
}

export function applyDeterministicCommercialIntakeFallback(rawIntake: string, parsed: ParsedDraftShape): ParsedDraftShape {
  const raw = rawIntake.replace(/\r\n/g, "\n").trim();
  if (raw.length < 12) return parsed;
  let next: ParsedDraftShape = { ...parsed };

  const explicit = explicitIntentCanonicalTitle(raw);
  const priorTitle = (parsed.title || "").trim();
  const titleThin = !priorTitle || priorTitle === "Agreement" || looksLikePaymentPlanMisrouteTitle(priorTitle);
  if (explicit && titleThin) {
    next.title = explicit;
  }

  const scopeM = /\bscope\s+includes\s+([\s\S]+?)(?:\.(?:\s|$)|(?=\s*total\s+fee\b)|(?=\s*term\b))/i.exec(raw);
  if (scopeM && !(next.purpose || "").trim()) {
    next.purpose = collapseWs(scopeM[1]);
  }

  const payM = /\btotal\s+fee\s+([^.\n]+(?:\.[^.\n]+)?)/i.exec(raw);
  if (payM && !(next.payment_terms || "").trim()) {
    next.payment_terms = collapseWs(payM[1]);
  }

  const termM = /\bterm\s+([^.]+?)(?:\.(?:\s|$)|$)/i.exec(raw);
  if (termM && !(next.duration || "").trim()) {
    next.duration = collapseWs(termM[1]);
  }

  const lawM = /\bgoverning\s+law\s+([^.]+?)(?:\.(?:\s|$)|$)/i.exec(raw);
  const j0 = (next.jurisdiction || "").trim();
  if (lawM && (!j0 || j0.toLowerCase() === "tbd")) {
    next.jurisdiction = collapseWs(lawM[1]);
  }

  return next;
}
