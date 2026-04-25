/**
 * Cheap local fallback when structured extraction left generic Party A / Party B
 * but the intake names a person + entity (e.g. employment-style phrasing).
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const MAX_NAME = 280;

function looksLikeGenericPartyRow(parties: { name: string; role: string }[]): boolean {
  if (parties.length < 2) return true;
  const blob = parties.map((p) => p.name).join(" ").toLowerCase();
  return (
    /\bparty\s*a\b|\bparty\s*b\b|edit\s+in\s+review|placeholder/i.test(blob) ||
    (/\bparty\s+a\b/i.test(blob) && /\bparty\s+b\b/i.test(blob))
  );
}

/**
 * e.g. "employment agreement for John Smith at Acme LLC" / "for Jane Doe in Widget Inc."
 */
export function tryInferNamedPartiesFromIntake(raw: string): { name: string; role: string }[] | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 12) return null;

  const emp = t.match(
    /\b(?:employment|hire|hiring)\s+(?:agreement|contract)\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:at|in|with)\s+([^.,;]{2,120}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|Co\.))\b/i,
  );
  if (emp && emp[1] && emp[2]) {
    return [
      { name: emp[1].trim().slice(0, MAX_NAME), role: "party" },
      { name: emp[2].trim().replace(/\s+/g, " ").slice(0, MAX_NAME), role: "party" },
    ];
  }

  const forOrg = t.match(
    /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:at|in|with)\s+([^.,;]{2,120}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company))\b/i,
  );
  if (forOrg && forOrg[1] && forOrg[2] && /\b(?:agreement|contract|employment)\b/i.test(t)) {
    return [
      { name: forOrg[1].trim().slice(0, MAX_NAME), role: "party" },
      { name: forOrg[2].trim().replace(/\s+/g, " ").slice(0, MAX_NAME), role: "party" },
    ];
  }

  const between = t.match(/\bbetween\s+([^,]{2,120}?)\s+and\s+([^.,;]{2,120})\b/i);
  if (between && between[1] && between[2]) {
    const a = between[1].trim();
    const b = between[2].trim();
    if (a.length >= 2 && b.length >= 2 && !/^the\s+/i.test(a)) {
      return [
        { name: a.slice(0, MAX_NAME), role: "party" },
        { name: b.slice(0, MAX_NAME), role: "party" },
      ];
    }
  }

  return null;
}

/** Merge inferred names only when current parties are clearly generic placeholders. */
export function applyNamedPartyFallbackFromIntake(parsed: ParsedDraftShape, intakeText: string): ParsedDraftShape {
  const parties = parsed.parties || [];
  if (!looksLikeGenericPartyRow(parties)) return parsed;
  const inferred = tryInferNamedPartiesFromIntake(intakeText);
  if (!inferred || inferred.length < 2) return parsed;
  return { ...parsed, parties: inferred };
}
