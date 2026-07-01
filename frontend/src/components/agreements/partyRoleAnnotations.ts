/**
 * Universal party role-annotation stripper.
 *
 * Customer intakes routinely tag parties with role hints that must NOT be part of the
 * party name itself, but also must NOT cause downstream splitters / dedupes to drop
 * the party entirely. Examples:
 *
 *   "Sunset Holdings LLC, as landlord, and Alex Park"         → "Sunset Holdings LLC", "Alex Park"
 *   "Apex Sellers LLC (seller), Chen Family Trust (buyer)"    → "Apex Sellers LLC", "Chen Family Trust"
 *   "FoundCo Inc., Jane Smith (advisor), East Bay Ventures"   → "FoundCo Inc.", "Jane Smith", "East Bay Ventures"
 *
 * Universal rule: extract role from a parenthetical OR a "comma-as-role-comma" clause,
 * then return the bare name. Role metadata is preserved on the party object by callers
 * that care (so "as guarantor" doesn't disappear silently — see `extractPartyRoleHint`).
 *
 * NEVER family-specific. Lease, purchase, advisor, NDA, services, OA all share this.
 */

/**
 * Common role tokens we recognize when parsing roles from a party label.
 * The list is descriptive and intentionally narrow — when in doubt, callers retain
 * the original wording in `additional_terms` rather than guessing a role.
 */
const ROLE_TOKEN_SOURCE = [
  "landlord", "lessor", "tenant", "lessee", "guarantor", "co-tenant", "co-signer",
  "seller", "buyer", "purchaser", "vendor", "vendee",
  "advisor", "advisory", "advisee", "investor", "observer", "consultant", "contractor",
  "client", "customer", "service provider", "provider", "company", "developer", "designer",
  "owner", "manager", "managing member", "member",
  "escrow agent", "escrow", "title agent", "agent", "broker",
  "disclosing party", "receiving party",
  "trustee", "beneficiary", "grantor",
  "licensor", "licensee",
  "employer", "employee",
  "principal", "counterparty",
  "witness", "notary", "notary public",
  "contact",
];
const ROLE_TOKEN_RE = new RegExp(`\\b(?:${ROLE_TOKEN_SOURCE.join("|")})\\b`, "i");

/**
 * After the party list ends, the next labeled field (Property:, Rent:, etc.) must NOT be
 * parsed as part of a party name — and commas inside address/property lines must not
 * create phantom party segments. Truncate the "between …" / first-line clause here first.
 */
export const LABELED_FIELD_AFTER_PARTY_LIST_RE =
  /\b(?:property|premises|address|purchase\s+price|rent|deposit|security\s+deposit|closing\s+date|effective\s+date|initial\s+term|term|governing\s+law|jurisdiction|venue|scope(?:\s+of\s+work)?|services|purpose|ownership|members?|management|management\s+structure|contact|witness|notary|governance|compensation|commercial\s+terms|background|confidentialit(?:y|ies)|deliverables?|payment(?:\s+schedule)?|revenue\s+allocation|liability)\s*[:\-]/i;

export function truncatePartyClauseTailAtLabeledFields(s: string): string {
  const t = (s || "").trim();
  if (!t) return t;
  const m = LABELED_FIELD_AFTER_PARTY_LIST_RE.exec(t);
  if (!m || m.index === undefined) return t;
  return t.slice(0, m.index).trim();
}

/**
 * Strip parenthetical role hints `(landlord)` / `(seller)` / `(advisor)` etc. from a party fragment.
 * Returns the cleaned fragment plus the matched role (lowercase, trimmed) when present.
 */
export function stripParentheticalRoleHint(name: string): { name: string; role: string | null } {
  const m = name.match(/\s*\(\s*([^)]{2,120})\s*\)\s*$/);
  if (!m) return { name: name.trim(), role: null };
  const inner = m[1].trim();
  if (!ROLE_TOKEN_RE.test(inner) && !/^trustee\s+of\b/i.test(inner)) return { name: name.trim(), role: null };
  return { name: name.slice(0, m.index ?? 0).trim(), role: inner.toLowerCase() };
}

/**
 * Strip trailing "as <role>" clauses (with or without leading comma) from a party fragment.
 * Examples:
 *   "Sunset Holdings LLC as landlord"   → "Sunset Holdings LLC" / "landlord"
 *   "Sunset Holdings LLC, as landlord"  → "Sunset Holdings LLC" / "landlord"
 *   "Acme LLC as a service provider"    → "Acme LLC" / "service provider"
 */
export function stripAsRoleClause(name: string): { name: string; role: string | null } {
  const m = name.match(/^(.+?)\s*,?\s+as\s+(?:an?\s+|the\s+)?([a-z][a-z\s\-]{2,40})\s*$/i);
  if (!m) return { name: name.trim(), role: null };
  const inner = m[2].trim();
  if (!ROLE_TOKEN_RE.test(inner)) return { name: name.trim(), role: null };
  return { name: m[1].trim().replace(/[,;:]+$/, "").trim(), role: inner.toLowerCase() };
}

/**
 * "Jamie Chen individually and as guarantor" → "Jamie Chen" / "guarantor"
 */
export function stripIndividuallyAndAsRole(name: string): { name: string; role: string | null } {
  const m = name.match(/^(.+?)\s+individually\s+and\s+as\s+(?:an?\s+|the\s+)?([a-z][a-z\s\-]{2,40})\s*$/i);
  if (!m) return { name: name.trim(), role: null };
  const inner = m[2].trim();
  if (!ROLE_TOKEN_RE.test(inner)) return { name: name.trim(), role: null };
  return { name: m[1].trim().replace(/[,;:]+$/, "").trim(), role: inner.toLowerCase() };
}

/**
 * One-shot cleanup: strip parenthetical role hints AND trailing "as <role>" clauses.
 * Preserves whichever role hint is present (parenthetical wins over `as`).
 */
export function stripPartyRoleAnnotations(name: string): { name: string; role: string | null } {
  const fromParen = stripParentheticalRoleHint(name);
  if (fromParen.role) return fromParen;
  const fromIndiv = stripIndividuallyAndAsRole(fromParen.name);
  if (fromIndiv.role) return fromIndiv;
  const fromAs = stripAsRoleClause(fromIndiv.name);
  if (fromAs.role) return fromAs;
  return fromIndiv;
}

/**
 * Pre-clean a "between …" tail before multi-party splitting. Removes
 *   - parenthetical role hints `(landlord)` / `(seller)` / `(advisor)` …
 *   - inline "<name>, as <role>," clauses (so the comma-and split doesn't drop the role half)
 *   - "and <names> as <role>" trailing clauses (e.g. "Alex and Jamie as tenants")
 *
 * The cleaning preserves commas / "and" boundaries so the splitter still finds 3+ parties.
 * We DO NOT remove "for <Entity>" tails here — those are stripped per-party in
 * `clampPartySegment` so a property reference can survive when relevant.
 */
export function preCleanBetweenTailForMultiPartySplit(tail: string): string {
  let s = tail;
  // Stop before Property:, Rent:, Premises:, etc. so address commas never become party delimiters.
  s = truncatePartyClauseTailAtLabeledFields(s);
  // "between A and B, with C as guarantor" → treat C as a third party (comma+and splitter).
  s = s.replace(/\s*,\s*with\s+/gi, " and ");
  // "Name, Trustee of the X Trust" — parenthesize so comma+and splitting does not fragment the trust line.
  s = s.replace(/,\s*(Trustee\s+of\s+(?:the\s+)?[A-Z][A-Za-z0-9&'\-\s]+?\bTrust\b)/gi, " ($1)");
  // Drop parenthetical role hints anywhere in the tail.
  s = s.replace(/\s*\(\s*([^)]{2,120})\s*\)/g, (whole, inner: string) => {
    return ROLE_TOKEN_RE.test(inner) || /^trustee\s+of\b/i.test(inner) ? "" : whole;
  });
  // Strip ", as <role>," / ", as <role>" interpolations.
  s = s.replace(
    /\s*,\s*as\s+(?:an?\s+|the\s+)?([a-z][a-z\s\-]{2,40})(?=,|\s+and\b|\.|$)/gi,
    (whole, inner: string) => (ROLE_TOKEN_RE.test(inner) ? "" : whole),
  );
  // Strip trailing "<list> as <role>(s?)" — but only the role suffix, leaving the names.
  // Skip when this is the tail of "individually and as <role>" — that phrase is stripped per-party in
  // {@link stripIndividuallyAndAsRole}; removing "as guarantor" here would orphan "individually".
  s = s.replace(
    /\s+as\s+(?:an?\s+|the\s+)?([a-z][a-z\s\-]{2,40}?)s?\b\s*(?=,|\.|\b(?:for|of|in|at|on)\b|$)/gi,
    (whole, inner: string, offset, full) => {
      const head = full.slice(0, offset);
      if (/\bindividually\s+and\s*$/i.test(head)) return whole;
      return ROLE_TOKEN_RE.test(inner) ? " " : whole;
    },
  );

  // Truncate at a trailing " for <purpose>" tail when the substring after "for"
  // does NOT itself contain an entity-suffixed company name. Purpose phrases like
  //   "for 123 Mockingbird Lane, Austin TX"
  //   "for SaaS implementation"
  //   "for vacation cabin at 12 Lakeside Dr"
  // never name a party — they describe the deal subject. Entity-suffixed tails like
  //   "for Apollo Data LLC"
  // are preserved here and stripped per-party in `clampPartySegment` instead.
  const forMatch = s.match(/^([\s\S]*?)\s+for\s+([\s\S]+)$/i);
  if (forMatch) {
    const tailAfterFor = forMatch[2];
    const looksLikeEntityTail = /\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|LLP|PLLC)\b/i.test(tailAfterFor);
    if (!looksLikeEntityTail) {
      s = forMatch[1].trim();
    }
  }

  // Collapse double spaces / dangling commas.
  s = s.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
  // Strip trailing punctuation that role/parenthetical removal may have left dangling
  // ("John Smith," → "John Smith"). Preserve a trailing entity suffix dot ("Inc.", "Co.").
  s = s.replace(/[,;:]+$/g, "").trim();
  return s;
}
