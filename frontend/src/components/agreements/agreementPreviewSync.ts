/**
 * Best-effort extraction of structured fields from the deterministic preview text.
 * Only returns keys we are confident about — caller must merge without clobbering with empty.
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { sanitizePartiesInput } from "./partyIntakeNormalize";

const MAX_PARTY_LEN = 280;

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

/** Split "A ("Role") and B" style preview parties line into two names (best effort). */
function splitPartiesFromBetweenLine(line: string): [string, string] | null {
  const t = sanitizePartiesInput(line.replace(/\s+/g, " ").trim());
  if (t.length < 6) return null;
  // Remove parenthetical role markers like ("Party")
  const cleaned = t.replace(/\s*\([^)]{0,40}\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const andIdx = cleaned.search(/\s+and\s+/i);
  if (andIdx <= 0) return null;
  const a = cleaned.slice(0, andIdx).trim();
  const b = cleaned.slice(andIdx).replace(/^\s+and\s+/i, "").trim();
  if (a.length < 2 || b.length < 2) return null;
  return [a.slice(0, MAX_PARTY_LEN), b.slice(0, MAX_PARTY_LEN)];
}

function extractSection(text: string, startRe: RegExp, endRe: RegExp): string | null {
  const m = text.match(startRe);
  if (!m || m.index == null) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const endM = rest.match(endRe);
  const body = (endM ? rest.slice(0, endM.index) : rest).trim();
  return body.length >= 2 ? body : null;
}

export function extractStructuredPatchesFromPreview(
  text: string,
  current: ParsedDraftShape,
): Partial<ParsedDraftShape> {
  const patch: Partial<ParsedDraftShape> = {};
  const t = text.replace(/\r\n/g, "\n");

  const betweenLine = t.match(/by and between\s+(.+?)\s+\(together,?\s+the/si);
  if (betweenLine) {
    const pair = splitPartiesFromBetweenLine(betweenLine[1]);
    if (pair) {
      const [n0, n1] = pair.map((n) => sanitizePartiesInput(n)) as [string, string];
      const cur0 = nz(current.parties?.[0]?.name);
      const cur1 = nz(current.parties?.[1]?.name);
      if (n0 && n1 && (n0 !== cur0 || n1 !== cur1)) {
        patch.parties = [
          { name: n0, role: current.parties?.[0]?.role || "party" },
          { name: n1, role: current.parties?.[1]?.role || "party" },
        ];
      }
    }
  }

  const pay = extractSection(t, /\n2\.\s*Payment Terms\s*\n/i, /\n3\.\s*Term/i);
  if (pay && pay.length >= 8 && pay.length < 8000 && !/^\[Not yet specified\]$/i.test(pay)) {
    const cur = nz(current.payment_terms);
    if (pay !== cur) patch.payment_terms = pay;
  }

  const lawM = t.match(/laws of\s+([^,\n.]+(?:\s+[^,\n.]+){0,4})\s*,\s*without regard/i);
  if (lawM) {
    const j = lawM[1].trim();
    if (j.length >= 2 && j.length < 120 && j !== nz(current.jurisdiction)) {
      patch.jurisdiction = j;
    }
  }

  const term = extractSection(t, /\n5\.\s*Termination\s*\n/i, /\n6\.\s*Additional/i);
  if (term && term.length >= 8 && term.length < 12000 && !/^\[Not yet specified\]$/i.test(term)) {
    const cur = nz(current.termination_summary);
    if (term !== cur) patch.termination_summary = term;
  }

  return patch;
}
