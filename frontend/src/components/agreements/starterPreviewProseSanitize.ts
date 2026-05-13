/**
 * Starter-preview prose sanitizer.
 *
 * Replaces internal-process phrasing ("specified in review", "edit in review",
 * "to be refined in review", etc.) with legally neutral public-facing wording for
 * customer-facing starter previews. The underlying draft model fields are unchanged
 * — only the rendered prose is humanized.
 *
 * Universal rendering layer — never family-specific.
 */

type Replacement = { pattern: RegExp; replacement: string };

const REPLACEMENTS: Replacement[] = [
  // Parenthetical placeholders like "Party A (edit in review)" → "Party A".
  { pattern: /\s*\(edit in review\)/gi, replacement: "" },
  { pattern: /\s*\(name(?:s)? in review\)/gi, replacement: "" },
  { pattern: /\s*\(names? and interests to be finalized in review\)/gi, replacement: "" },
  { pattern: /\s*\(unless a different effective date is specified in review\)/gi, replacement: "" },

  // Sentence-level "specified in review" / "in review" / "agreed in review" idioms.
  { pattern: /\bunless otherwise specified in review\b/gi, replacement: "unless otherwise agreed by the parties" },
  { pattern: /\bspecified in review\b/gi, replacement: "agreed by the parties" },
  { pattern: /\b(?:to be|to-be)\s+refined\s+in\s+review\b/gi, replacement: "to be agreed by the parties" },
  { pattern: /\b(?:to be|to-be)\s+described\s+in\s+review\b/gi, replacement: "to be agreed by the parties" },
  { pattern: /\b(?:to be|to-be)\s+agreed\s+in\s+review\b/gi, replacement: "to be agreed by the parties" },
  { pattern: /\b(?:to be|to-be)\s+defined\s+in\s+review\b/gi, replacement: "to be agreed by the parties" },
  { pattern: /\b(?:to be|to-be)\s+finalized\s+in\s+review\b/gi, replacement: "to be agreed by the parties" },
  { pattern: /\b(?:to be|to-be)\s+listed\s+in\s+review\b/gi, replacement: "to be agreed by the parties" },
  { pattern: /\bdescribed in review\b/gi, replacement: "agreed by the parties" },
  { pattern: /\brefined in review\b/gi, replacement: "agreed by the parties" },
  { pattern: /\bdefined in review\b/gi, replacement: "agreed by the parties" },
  { pattern: /\bagreed in review\b/gi, replacement: "agreed by the parties" },

  // "add specifics in review" / "(add specifics in review if compensation applies)" idioms.
  { pattern: /\s*\(add specifics in review[^)]*\)/gi, replacement: "" },
  { pattern: /\s*—?\s*add specifics in review\b/gi, replacement: "" },

  // "to be agreed in review" → "to be agreed between the parties".
  { pattern: /\bto be agreed in review\b/gi, replacement: "to be agreed between the parties" },
  { pattern: /\bfor this review shell\b/gi, replacement: "for the final agreement" },
  { pattern: /\breview shell\b/gi, replacement: "starter preview" },
  { pattern: /\bfinalized in review\b/gi, replacement: "completed by the parties unless otherwise agreed" },

  // Cleanup leftover whitespace from placeholder removal.
  { pattern: / {2,}/g, replacement: " " },
  { pattern: / +([,.;])/g, replacement: "$1" },
];

/**
 * Apply all internal→public phrasing replacements. Idempotent.
 */
export function sanitizeStarterPreviewProse(text: string): string {
  if (!text) return text;
  let out = text;
  for (const { pattern, replacement } of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Trim trailing whitespace per line (preserve newlines).
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  return out;
}

/**
 * Sanitize a single party name (no role/parenthetical role hints).
 * Produces a clean public-facing party name like "Party A" from "Party A (edit in review)".
 */
export function sanitizeStarterPartyNameForDisplay(name: string): string {
  if (!name) return name;
  let s = name;
  s = s.replace(/\s*\(edit in review\)/gi, "");
  s = s.replace(/\s*\(disclosing\s*\/?\s*receiving[^)]*\)/gi, "");
  s = s.replace(/\s*\(name(?:s)?\s+in\s+review\)/gi, "");
  s = s.replace(/\s*\(names?\s+and\s+interests\s+to\s+be\s+finalized\s+in\s+review\)/gi, "");
  return s.replace(/\s+/g, " ").trim();
}
