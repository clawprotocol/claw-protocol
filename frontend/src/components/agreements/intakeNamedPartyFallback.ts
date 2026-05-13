/**
 * Cheap local fallback when structured extraction left generic Party A / Party B
 * but the intake names a person + entity (e.g. employment-style phrasing).
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { stripPartyRoleAnnotations } from "./partyRoleAnnotations";

const MAX_NAME = 280;

/**
 * Universal cleanup applied to every name produced by this fallback. Strips trailing
 * "(landlord)" / "(seller)" / "as guarantor" role hints so they don't leak into the
 * party name. Role metadata is dropped here because callers tag with role: "party".
 */
function cleanFallbackName(raw: string): string {
  const { name } = stripPartyRoleAnnotations((raw || "").trim());
  return name.replace(/\s+/g, " ").trim();
}

function looksLikeGenericPartyRow(parties: { name: string; role: string }[]): boolean {
  if (parties.length < 2) return true;
  const blob = parties.map((p) => p.name).join(" ").toLowerCase();
  return (
    /\bparty\s*a\b|\bparty\s*b\b|edit\s+in\s+review|placeholder/i.test(blob) ||
    (/\bparty\s+a\b/i.test(blob) && /\bparty\s+b\b/i.test(blob))
  );
}

/**
 * Extract explicit signer/party rows from intake text.
 * Matches patterns like:
 *   "Sender/signer 1: Anthem Blanchard, anthem@example.com"
 *   "Signer 2: Sarah Collins (sarah@test.com)"
 *   "Party 3 - Michael Reed"
 *   "Signer: Jamie Chen jamie@x.com"
 */
const SIGNER_LINE_RE =
  /(?:sender\s*[/&]?\s*)?(?:signer|party|signatory|recipient|reviewer)\s*(?:#?\d+)?[:\s—–-]+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+)/gi;

const EMAIL_AFTER_NAME_RE = /[,\s(]+([^\s,()@]+@[^\s,()]+)/;

function extractExplicitSignerRows(raw: string): { name: string; role: string; email?: string }[] | null {
  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  const results: { name: string; role: string; email?: string }[] = [];
  const seenNames = new Set<string>();

  for (const line of lines) {
    SIGNER_LINE_RE.lastIndex = 0;
    const m = SIGNER_LINE_RE.exec(line);
    if (!m || !m[1]) continue;
    const name = m[1].trim().slice(0, MAX_NAME);
    if (name.length < 3) continue;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    const rest = line.slice(m.index + m[0].length);
    const emailMatch = rest.match(EMAIL_AFTER_NAME_RE) || line.slice(m.index).match(EMAIL_AFTER_NAME_RE);
    const email = emailMatch?.[1]?.trim();
    results.push({ name, role: "party", ...(email ? { email } : {}) });
  }

  if (results.length < 2) {
    const fullText = raw.replace(/\s+/g, " ").trim();
    SIGNER_LINE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SIGNER_LINE_RE.exec(fullText)) !== null) {
      const name = match[1].trim().slice(0, MAX_NAME);
      if (name.length < 3) continue;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
      results.push({ name, role: "party" });
    }
  }

  return results.length >= 2 ? results : null;
}

/**
 * e.g. "employment agreement for John Smith at Acme LLC" / "for Jane Doe in Widget Inc."
 */
export function tryInferNamedPartiesFromIntake(raw: string): { name: string; role: string; email?: string }[] | null {
  const explicit = extractExplicitSignerRows(raw);
  if (explicit && explicit.length >= 2) return explicit;

  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 12) return null;

  const emp = t.match(
    /\b(?:employment|hire|hiring)\s+(?:agreement|contract)\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:at|in|with)\s+([^.,;]{2,120}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|Co\.))\b/i,
  );
  if (emp && emp[1] && emp[2]) {
    return [
      { name: cleanFallbackName(emp[1]).slice(0, MAX_NAME), role: "party" },
      { name: cleanFallbackName(emp[2]).slice(0, MAX_NAME), role: "party" },
    ];
  }

  const forOrg = t.match(
    /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:at|in|with)\s+([^.,;]{2,120}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company))\b/i,
  );
  if (forOrg && forOrg[1] && forOrg[2] && /\b(?:agreement|contract|employment)\b/i.test(t)) {
    return [
      { name: cleanFallbackName(forOrg[1]).slice(0, MAX_NAME), role: "party" },
      { name: cleanFallbackName(forOrg[2]).slice(0, MAX_NAME), role: "party" },
    ];
  }

  const between = t.match(/\bbetween\s+([^,]{2,120}?)\s+and\s+([^.,;]{2,120})\b/i);
  if (between && between[1] && between[2]) {
    const a = cleanFallbackName(between[1]);
    const b = cleanFallbackName(between[2]);
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
