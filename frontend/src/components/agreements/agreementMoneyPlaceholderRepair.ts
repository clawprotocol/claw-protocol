/**
 * Repairs common formatter corruption where thousands separators become bracket placeholders
 * (e.g. "$120,000" → "$120, [ADDRESS_1]").
 */

const MONEY_COMMA_BRACKET_RE =
  /\$\s*(\d{1,3}(?:,\d{3})*)\s*,\s*\[(?:ADDRESS|PARTY|ORG|PERSON|ENTITY)(?:[_\s-]+\d+)?\]/gi;

const MONEY_COMMA_BARE_TRAILING_RE = /\$\s*(\d{1,3})\s*,\s*(?=\s|$|[.;])/g;

/** Heuristic: short dollar amount + comma + internal slot often lost ",000". */
function repairThousandsGroup(_match: string, amountPart: string): string {
  const digitsOnly = amountPart.replace(/,/g, "");
  if (/^\d{1,3}$/.test(digitsOnly)) {
    return `$${digitsOnly},000`;
  }
  if (/^\d{1,3},\d{3}$/.test(amountPart)) {
    return `$${amountPart}`;
  }
  return `$${amountPart}`;
}

export function repairMoneyCommaBracketPlaceholderCorruption(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n?/g, "\n");

  out = out.replace(MONEY_COMMA_BRACKET_RE, (full, amountPart) => {
    const fixed = repairThousandsGroup(full, amountPart);
    if (fixed !== full) repairs.push(`money_comma_bracket:${amountPart}`);
    return fixed;
  });

  out = out.replace(MONEY_COMMA_BARE_TRAILING_RE, (full, digits) => {
    if (digits.length >= 4) return full;
    repairs.push(`money_comma_trailing:${digits}`);
    return `$${digits},000`;
  });

  return { text: out, repairs };
}

export function textHasMoneyCommaBracketCorruption(text: string): boolean {
  const t = text || "";
  return MONEY_COMMA_BRACKET_RE.test(t) || /\$\s*\d{1,3}\s*,\s*\[(?:ADDRESS|PARTY|ORG)/i.test(t);
}
