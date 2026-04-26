import type { LivePreviewModel } from "./liveDraftHeuristics";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

/**
 * Minimal bar to treat guided intake as “complete enough to continue” without blocking on every field.
 * Requires either party signal, scope/term heuristics, or a short substantive sentence.
 */
export function meetsMinimalIntakeProgress(raw: string, live: LivePreviewModel): boolean {
  const t = raw.trim();
  if (t.length < 12) return false;
  const wc = t.split(/\s+/).filter(Boolean).length;
  if (wc < 5) return false;
  const ex = live.extraction;
  if (ex?.scopeSignalPresent || ex?.termSignalPresent) return true;
  /** Real party detection only — placeholder copy alone must not skip guided questions. */
  if ((live.partiesLine || "").trim().length > 4) return true;
  if ((live.scopeLine || live.servicesLine || "").trim().length > 6) return true;
  if ((live.termLine || live.scheduleLine || "").trim().length > 2) return true;
  if (live.hasStructuredSignal && t.length >= 20 && wc >= 6) return true;
  return wc >= 8 && t.length >= 28;
}

/**
 * True when the live preview + intake text show enough structure that we should never
 * treat the user as being in a “failure / retry” state for normal partial input.
 */
export function isUsablePartialIntakeStructure(model: LivePreviewModel, intakeTrimmed: string): boolean {
  const t = intakeTrimmed.trim();
  if (t.length < 8) return false;
  if (meetsMinimalIntakeProgress(t, model)) return true;
  if (model.docTitle.trim() && model.docTitle !== "Agreement") return true;
  if (model.hasStructuredSignal && t.length >= 16) return true;
  if (
    (model.partiesLine || model.scopeLine || model.servicesLine || model.compensationLine || model.termLine || "")
      .trim()
      .length > 4
  ) {
    return true;
  }
  return false;
}

/**
 * If POST /draft or hydrate fails, we can still show the on-create review surface when
 * the parse result is clearly a real draft (avoids a dead end when the API is down or CORS-misconfigured).
 */
export function isStructuredDraftUsableForLocalReviewFallback(
  parsed: Pick<ParsedDraftShape, "title" | "purpose" | "parties">,
  model: LivePreviewModel,
  rawIntake: string,
): boolean {
  if (isUsablePartialIntakeStructure(model, rawIntake)) return true;
  if ((parsed.parties || []).length < 1) return false;
  if (!(parsed.purpose || "").trim() || (parsed.purpose || "").trim().length < 8) return false;
  if (!(parsed.title || "").trim() || (parsed.title || "").trim().length < 2) return false;
  return true;
}

/** Compact, assistive next-step ideas (never required). */
export function buildIntakeGuidedHints(model: LivePreviewModel, intakeTrimmed: string): string[] {
  const low = intakeTrimmed.toLowerCase();
  const dt = (model.docTitle || "").toLowerCase();
  if (/\bnda\b|confidential|non-disclosure/.test(low) || dt.includes("confidential")) {
    return [
      "Add party names",
      "Add confidentiality purpose or term",
      "Add duration or end date",
      "Mutual or one-way NDA?",
    ];
  }
  if (dt.includes("consult") || /\bconsult/.test(low)) {
    return ["Add party names", "Add scope or deliverables", "Add retainer or fee terms", "Add term length"];
  }
  if (dt.includes("service") || /\bservices?\b/.test(low)) {
    return [
      "Add party names",
      "Describe the work or scope",
      "Add payment or “no payment” if applicable",
      "Add timing or schedule",
    ];
  }
  if (dt.includes("employment") || /\bemploy|hire|salary|w-2|w2\b/.test(low)) {
    return [
      "Add employer and hire (name or role)",
      "Add compensation outline",
      "Add start date or term",
      "Add governing state if you know it",
    ];
  }
  return [
    "Add party names",
    "Add scope or key obligations",
    "Add payment or timing if it applies",
    "Add governing law (state) if you know it",
  ];
}

export const INTAKE_GUIDANCE_ONBOARDING =
  "This is enough to begin. You can keep it simple and fill in missing details next.";

export const INTAKE_GUIDANCE_AFTER_API_SOFT =
  "Good start — add party names or key terms now, or continue and refine on the next step.";

export const INTAKE_GUIDANCE_AFTER_API_RETURNING =
  "We’ve started your agreement. You can continue now or add a few details first.";
