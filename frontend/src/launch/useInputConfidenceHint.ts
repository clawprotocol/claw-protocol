import { useEffect, useState } from "react";

/** Shown on homepage and create flow as clickable starters. */
export const EXAMPLE_INTAKE_PROMPTS = [
  "Freelancer agreement for $5k project",
  "Simple NDA between two parties",
  "Consulting agreement with monthly retainer",
] as const;

/** First-run simple create — deterministic starter actions (must match guided routing heuristics). */
export const SIMPLE_CREATE_CONVERSATION_STARTERS = [
  "Simple NDA between two parties",
  "Independent contractor agreement",
  "Consulting agreement with monthly retainer",
] as const;

const ROTATING = [
  "Generating structured agreement…",
  "Organizing terms…",
  "Preparing draft…",
] as const;

/**
 * Cycling status while the user is typing, using voice, or (optionally) while work is in flight —
 * reduces “is anything happening?” hesitation on first use.
 */
export function useInputConfidenceHint(active: boolean): string | null {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % ROTATING.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [active]);
  if (!active) return null;
  return ROTATING[idx];
}
