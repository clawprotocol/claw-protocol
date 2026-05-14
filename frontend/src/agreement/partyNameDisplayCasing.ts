import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";

/**
 * Production-safe display casing for agreement party names.
 *
 * 1. Prefer the exact span from raw intake when it matches the cleaned name
 *    case-insensitively and carries strictly more uppercase letters (guards against
 *    demoting a canonicalized form).
 * 2. Then normalize common legal-entity suffix tokens on the final segment (LP, LLC,
 *    Inc., Ltd., Corp., Co., etc.).
 */

function countUppercaseLetters(s: string): number {
  return (s.match(/[A-Z]/g) || []).length;
}

/**
 * When canonicalization flattened intentional intake casing (e.g. FoundryCo, MidCap)
 * and the original intake text is available, prefer the intake substring only when it
 * has strictly more uppercase letters than the cleaned variant.
 */
export function restorePartyNameCasingFromIntakeText(
  name: string,
  intakeText: string | null | undefined,
): string {
  const trimmed = (name || "").trim();
  const intake = (intakeText || "").trim();
  if (!trimmed || !intake) return name;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let m: RegExpExecArray | null = null;
  try {
    m = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").exec(intake);
  } catch {
    return name;
  }
  if (!m) return name;
  const original = m[0];
  if (original === trimmed) return name;
  const upperOrig = countUppercaseLetters(original);
  const upperClean = countUppercaseLetters(trimmed);
  if (upperOrig <= upperClean) return name;
  return original;
}

/** Normalize the last whitespace-delimited token when it is a known entity suffix. */
function normalizeEntityTailToken(tail: string): string {
  let x = tail;
  x = x.replace(/\bLp\.?$/i, "LP");
  x = x.replace(/\bLlp\.?$/i, "LLP");
  x = x.replace(/\bLlc\.?$/i, "LLC");
  x = x.replace(/\bP\.?l\.?l\.?c\.?$/i, "PLLC");
  x = x.replace(/\bL\.L\.C\.?$/i, "L.L.C.");
  x = x.replace(/\bInc\.?$/i, "Inc.");
  x = x.replace(/\bLtd\.?$/i, "Ltd.");
  x = x.replace(/\bCorp\.?$/i, "Corp.");
  // Standalone trailing "Co" / "Co." (not internal camelCase like FoundryCo).
  x = x.replace(/(?<=^|\s)Co\.?$/i, "Co.");
  return x;
}

export function normalizeLegalEntitySuffixCasing(name: string): string {
  const t = (name || "").trim();
  if (!t) return name;
  const m = t.match(/^(.*\s)([^\s]+)$/);
  if (!m) return normalizeEntityTailToken(t);
  const head = m[1]!;
  const tail = m[2]!;
  return (head + normalizeEntityTailToken(tail)).trimEnd();
}

export function finalizePartyDisplayNameForUserFacing(
  name: string,
  intakeText?: string | null,
): string {
  const trimmed = (name || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return name;
  const restored = restorePartyNameCasingFromIntakeText(trimmed, intakeText ?? null);
  return normalizeLegalEntitySuffixCasing(restored);
}

export function applyPartyNameCasingPassToDraft(
  draft: ParsedDraftShape,
  rawIntake: string,
): ParsedDraftShape {
  const parties = draft.parties;
  if (!parties?.length) return draft;
  const intake = rawIntake.trim();
  if (!intake) return draft;
  const nextParties = parties.map((p) => ({
    ...p,
    name: finalizePartyDisplayNameForUserFacing(String(p.name || "").trim(), intake),
  }));
  return { ...draft, parties: nextParties };
}
