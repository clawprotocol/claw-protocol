import type { ParsedDraftShape } from "./intakeSmartDefaults";

const nz = (s: string | null | undefined) => (s || "").trim();

/**
 * Deterministic, client-only interpretation of short review-stage refinement prompts.
 * Used when the remote refine endpoint is unavailable — no API usage.
 */
export function tryApplyLocalReviewRefineInstruction(
  draft: ParsedDraftShape,
  instruction: string,
): ParsedDraftShape | null {
  const ins = instruction.trim();
  if (!ins) return null;
  const low = ins.toLowerCase();

  const next: ParsedDraftShape = { ...draft };

  const wantsTermination =
    /(?:add|include|insert|need).{0,90}(?:termination|terminate|end\s+the\s+agreement)/i.test(ins) ||
    /reasonable\s+(?:prior\s+)?(?:written\s+)?notice/i.test(low) ||
    (/\bterminat/i.test(ins) && /\b(?:both|either)\s+part/i.test(low));

  if (wantsTermination) {
    const cur = nz(next.termination_summary);
    const weak = !cur || /^not\s+set\b/i.test(cur) || /^\[not/i.test(cur) || /^tbd$/i.test(cur);
    if (weak || /(?:add|include|insert|clause)/i.test(ins)) {
      next.termination_summary =
        "Either party may terminate this agreement with reasonable prior written notice.";
      return next;
    }
  }

  if (/(?:add|include|insert|need).{0,80}confidential/i.test(ins)) {
    const add =
      "\n\nConfidentiality: Each party agrees to hold the other party's non-public information in confidence and to use it only to perform under this agreement.";
    next.additional_terms = (nz(next.additional_terms) + add).trim();
    return next;
  }

  if (/clarif.{0,50}payment|payment\s+terms?|compensation\s+terms?|invoice|invoic/i.test(ins)) {
    const pt = nz(next.payment_terms);
    next.payment_terms = pt
      ? `${pt}\n\n[Review: specify amount, cadence, invoicing, and any late-payment terms explicitly.]`
      : "Payment amount, cadence, invoicing, and any late fees to be specified here.";
    return next;
  }

  if (/at[\s-]?will|indefinite\s+(?:term|duration)/i.test(ins)) {
    next.duration = "At-will / ongoing unless the parties agree otherwise in writing.";
    const ts = nz(next.termination_summary);
    if (!ts || /^not\s+set\b/i.test(ts) || /^\[not/i.test(ts)) {
      next.termination_summary =
        "This relationship is at-will. Either party may end it at any time, with or without cause or advance notice, except where applicable law requires otherwise.";
    }
    return next;
  }

  return null;
}
