import type { DealVariable } from "./types";

/** Structured IP split when user picks Shared / custom without typing. */
export const GUIDED_SHARED_IP_STRUCTURED_ANSWER =
  "Use a split IP structure: Company owns project-specific deliverables created for the engagement; Contractor retains pre-existing tools, libraries, know-how, and reusable developer materials; Company receives a perpetual license to embedded Contractor background materials as needed to use the deliverables.";

export type GuidedPillResolution =
  | { action: "apply"; displayAnswer: string; instructionAnswer: string }
  | { action: "custom" }
  | { action: "recommend" };

export function resolveGuidedAnswerForPill(
  variable: DealVariable,
  pillId: string,
  label: string,
  value: string,
): GuidedPillResolution {
  if (pillId === "recommend") {
    return { action: "recommend" };
  }
  if (pillId === "custom") {
    return { action: "custom" };
  }
  if (
    pillId === "shared" &&
    (variable.id === "ip_ownership_contradiction" || variable.id === "ip_ownership")
  ) {
    return {
      action: "apply",
      displayAnswer: "Shared / custom split structure",
      instructionAnswer: GUIDED_SHARED_IP_STRUCTURED_ANSWER,
    };
  }
  const instructionAnswer = (value || label).trim();
  if (!instructionAnswer) {
    return { action: "custom" };
  }
  return {
    action: "apply",
    displayAnswer: label || instructionAnswer.slice(0, 80),
    instructionAnswer,
  };
}
