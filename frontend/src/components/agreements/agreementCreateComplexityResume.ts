import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { pickLongestPremiumIntakeCorpus, readOriginalUserIntakeRaw } from "./originalUserIntakeRawStorage";

const KEY = "claw_create_complexity_resume_v1";

/** complexity_gate: OA / SAFE-class intercept. optional_full_upgrade: user chose optional full draft from instant path. */
export type CreateComplexityResumeKind = "complexity_gate" | "optional_full_upgrade";

export type CreateComplexityResumeV1 = {
  version: 1;
  rawIntake: string;
  pending: ParsedDraftShape;
  awaitingProCheckout: boolean;
  savedAt: number;
  resume_kind?: CreateComplexityResumeKind;
  /** Exact premium “apply my wording” notes — survives Stripe return (refs do not). */
  premiumUpgradeNotes?: string;
  /** Longest captured home-path prompt; premium parse corpus (with upgrade notes merged at checkout). */
  originalUserIntakeRaw?: string;
};

export function stashCreateComplexityResume(payload: {
  rawIntake: string;
  pending: ParsedDraftShape;
  awaitingProCheckout: boolean;
  resume_kind?: CreateComplexityResumeKind;
  premiumUpgradeNotes?: string;
  originalUserIntakeRaw?: string;
}): void {
  try {
    const body: CreateComplexityResumeV1 = {
      version: 1,
      savedAt: Date.now(),
      rawIntake: payload.rawIntake.trim(),
      pending: payload.pending,
      awaitingProCheckout: payload.awaitingProCheckout,
      resume_kind: payload.resume_kind ?? "complexity_gate",
    };
    const notes = typeof payload.premiumUpgradeNotes === "string" ? payload.premiumUpgradeNotes.trim() : "";
    if (notes) body.premiumUpgradeNotes = notes;
    const origPayload = typeof payload.originalUserIntakeRaw === "string" ? payload.originalUserIntakeRaw.trim() : "";
    const origStore = readOriginalUserIntakeRaw().trim();
    const origPick = pickLongestPremiumIntakeCorpus(40, origPayload, origStore, payload.rawIntake.trim());
    if (origPick) body.originalUserIntakeRaw = origPick;
    sessionStorage.setItem(KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

export function readCreateComplexityResume(): CreateComplexityResumeV1 | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateComplexityResumeV1;
    if (parsed?.version !== 1 || !parsed.pending || typeof parsed.rawIntake !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCreateComplexityResume(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
