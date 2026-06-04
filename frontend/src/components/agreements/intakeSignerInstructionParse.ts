/**
 * Parse and strip home-prompt signer instructions ("Signer for X LLC is Name, Title.")
 * so they populate authority without contaminating party legal names or agreement body.
 */

import type { EntitySignerMetadataCandidate } from "./universalSignerMetadataAuthority";

/** Canonical QA home prompt (Blue Canyon / Iron Vale + Sarah Mitchell / Michael Torres). */
export const BLUE_CANYON_QA_HOME_PROMPT =
  "I need a consulting agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc. for AI workflow implementation services. Fixed fee $8,500. Client owns all work product after full payment. Delaware law. Mutual confidentiality. Termination for material breach with 15 days notice and opportunity to cure. Limitation of liability excluding fraud, willful misconduct, and confidentiality breaches. Signer for Blue Canyon Analytics LLC is Sarah Mitchell, CEO. Signer for Iron Vale Systems Inc. is Michael Torres, President.";

/** Entity capture allows Inc./LLC terminal periods before " is ". */
export const SIGNER_FOR_ENTITY_IS_CLAUSE_RE =
  /\bSigner\s+for\s+(.+?)\s+is\s+([^,\n]+?)(?:,\s*([^,\n]+?))?(?:\.|$)/gi;

const LEGAL_ENTITY_TAIL_RE =
  /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?$/i;

/** Opening/body contamination: "between for Entity LLC is Human Name". */
const BETWEEN_FOR_ENTITY_IS_SIGNER_RE =
  /\bbetween\s+for\s+((?:[A-Za-z0-9][A-Za-z0-9\s&'.-]*?)(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?)\s+is\s+[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)*(?:,\s*[A-Z][a-z'.-]+)?/gi;

/** Stray line or fragment: "for Iron Vale Systems Inc." with no following deal purpose. */
const STRAY_FOR_ENTITY_ONLY_RE =
  /(?:^|\n)\s*for\s+((?:[A-Za-z0-9][A-Za-z0-9\s&'.-]*?)(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?)\s*(?:\.|$)(?=\s*(?:\n|$|Signer\s+for\b))/gim;

const INLINE_FOR_ENTITY_IS_SIGNER_RE =
  /\bfor\s+((?:[A-Za-z0-9][A-Za-z0-9\s&'.-]*?)(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?)\s+is\s+[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)*/gi;

/** Remove signer instruction sentences before party-list / between-clause parsing. */
export function stripSignerInstructionClausesFromIntake(raw: string): string {
  let text = (raw || "").replace(/\r\n/g, "\n");
  text = text.replace(SIGNER_FOR_ENTITY_IS_CLAUSE_RE, " ");
  return text.replace(/\s+/g, " ").trim();
}

export function isContaminatedPartyLegalNameFromSignerInstruction(name: string): boolean {
  const t = name.replace(/\s+/g, " ").trim();
  if (!t || t.length < 4) return false;
  if (/^\s*for\s+/i.test(t)) return true;
  if (/\bSigner\s+for\b/i.test(t)) return true;
  if (/\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Limited)\s+is\s+/i.test(t)) return true;
  if (/\bis\s+[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+\s*,/i.test(t) && LEGAL_ENTITY_TAIL_RE.test(t)) return true;
  return false;
}

export function matchSignerForEntityIsClauses(
  intakeRaw: string | null | undefined,
): Array<{ entity: string; signerName: string; signerTitle: string }> {
  const raw = String(intakeRaw || "");
  if (!raw.trim()) return [];
  const out: Array<{ entity: string; signerName: string; signerTitle: string }> = [];
  SIGNER_FOR_ENTITY_IS_CLAUSE_RE.lastIndex = 0;
  for (const m of raw.matchAll(SIGNER_FOR_ENTITY_IS_CLAUSE_RE)) {
    const entity = (m[1] ?? "").trim();
    const signerName = (m[2] ?? "").trim();
    const signerTitle = (m[3] ?? "").trim();
    if (!signerName) continue;
    out.push({ entity, signerName, signerTitle });
  }
  return out;
}

export function signerInstructionCandidatesFromIntake(
  intakeRaw: string | null | undefined,
): EntitySignerMetadataCandidate[] {
  return matchSignerForEntityIsClauses(intakeRaw).map((row) => ({
    entity: row.entity,
    signerName: row.signerName,
    signerTitle: row.signerTitle,
    source: "intake_natural_language" as const,
    authorityRank: 6,
  }));
}

/** Strip signer-instruction leakage from generated agreement plain text (display layer only). */
export function stripSignerInstructionContaminationFromCorpus(corpus: string): {
  text: string;
  repairs: number;
} {
  let text = (corpus || "").replace(/\r\n/g, "\n");
  let repairs = 0;

  const apply = (re: RegExp, repl: string | ((substring: string, ...args: string[]) => string)) => {
    re.lastIndex = 0;
    if (!re.test(text)) return;
    re.lastIndex = 0;
    const next = text.replace(re, repl as never);
    if (next !== text) {
      text = next;
      repairs += 1;
    }
  };

  apply(BETWEEN_FOR_ENTITY_IS_SIGNER_RE, "between $1");
  apply(INLINE_FOR_ENTITY_IS_SIGNER_RE, "$1");
  apply(STRAY_FOR_ENTITY_ONLY_RE, "\n");

  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}
