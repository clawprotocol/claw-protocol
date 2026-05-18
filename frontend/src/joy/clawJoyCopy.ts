/**
 * LawDog “Joy Layer” copy — confident, minimal, sharp.
 * Never childish, never corporate hype. Does not replace compliance text.
 *
 * Tone: short clauses. Period stops. No “Yay!!!”. No legal outcome guarantees.
 */
export const CANONICAL_PROOF_SENTENCE =
  "Recorded in LawDog. Ready to verify independently. External anchoring is optional and may complete later — not required for your record." as const;

/** Product line for inline copy — record state, not third-party certification. */
export const LAWDOG_ON_RECORD_LINE = "LawDog · on record" as const;

/** @deprecated Prefer LAWDOG_ON_RECORD_LINE or LawdogOnRecordStamp in UI. */
export const LAWDOG_CERTIFIED_STAMP = LAWDOG_ON_RECORD_LINE;

/** @deprecated Prefer {@link ../agreement/agreementLifecycleRail AGREEMENT_LIFECYCLE_PROGRESS_LABELS}. */
export { AGREEMENT_LIFECYCLE_PROGRESS_LABELS as SIMPLE_FLOW_PROGRESS_LABELS } from "../agreement/agreementLifecycleRail";

export const JOY_COPY = {
  /** After signing (single signer step done) */
  signLockedIn: "Signed. Verification recorded.",
  /** Fully executed / all parties */
  signSealedProof: "Fully signed. Your proof record is available.",
  /** Draft created → next step (aligned with review copy; product path only). */
  draftInMotion: "You now have a structured agreement ready for review and signature.",
  /** Outbound to recipients */
  sent: "Sent. Let's get it signed.",
  /** Done / milestone when send flag missing (direct load, new device) */
  readyToSendHeadline: "Ready when you are.",
  readyToSendSubline: "Continue from Send if you still need to share links — nothing goes out until you confirm there.",
  /** Proof / verification surface — avoids “no disputes” (could imply legal guarantee) */
  proofSecured: "On record. Ready to verify when you are.",
  /** Progress step micro-labels (simple product) */
  progressDraft: "Draft",
  progressSend: "Review",
  progressSeal: "Sign",
  progressProof: "Proof",
  /** Workspace / status */
  workspaceSealedTitle: "Sealed",
  workspaceSealedDetail: "Full record below — verify when you need it.",
  readOnlySealedHeadline: "Sealed agreement",
  /** Identity / social (non-legal) */
  taglineMoveWithProof: "You move with a proof record.",
  socialFollowThrough: "Built for people who actually follow through.",
  socialDidntDie: "Most agreements die. Yours didn't.",
  shareMilestonePrompt: "Want to share this milestone?",
  shareMilestoneHint:
    "The public link shows status and fingerprints — not your full agreement text on that page.",
} as const;

/** Documented tone rules for future copy (not shown in UI). */
export const JOY_TONE_RULES = `
Voice = confident, minimal, slightly sharp. Never corporate boilerplate. Never childish emoji dumps.
Good: "Signed. Recorded. Done."
Bad: "Yay! Your document is super complete!!!"
Legal/compliance blocks stay verbatim; joy sits beside them, not on top.
`.trim();
