export type ProAgreementCanonicalizationResult = {
  text: string;
  repairs: string[];
  warnings: string[];
};

const NUMBERED_HEADING_RE = /^(\d+(?:\.\d+)*)\.?\s+(.+?)\.?\s*$/;
const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+?)\.?\s*$/;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeKey(text: string): string {
  return cleanLine(text)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.,;:]+$/g, "")
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNumberedHeading(line: string): boolean {
  const t = cleanLine(line);
  const m = t.match(NUMBERED_HEADING_RE);
  if (!m) return false;
  const heading = m[2] ?? "";
  // A line like "1. SCOPE. Provider will perform..." is a clause with body text, not a bare heading.
  if (/\.\s+\S/.test(heading)) return false;
  if (heading.length > 95) return false;
  return /[A-Za-z]/.test(heading);
}

function isBareNumberedHeading(lines: string[], index: number): boolean {
  const current = lines[index] ?? "";
  if (!isNumberedHeading(current)) return false;
  const next = lines.slice(index + 1).find((line) => cleanLine(line));
  if (!next) return true;
  return isNumberedHeading(next);
}

function stripEmptyNumberedHeadings(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.split("\n");
  const out = lines.filter((line, index) => {
    if (!isBareNumberedHeading(lines, index)) return true;
    repairs.push(`empty_heading:${cleanLine(line).slice(0, 48)}`);
    return false;
  });
  return { text: out.join("\n"), repairs };
}

function stripRepeatedTitleInsideSectionOne(text: string): { text: string; repairs: string[] } {
  const lines = text.split("\n");
  const title = cleanLine(lines.find((line) => cleanLine(line)) ?? "");
  if (!title) return { text, repairs: [] };
  let inSectionOne = false;
  const repairs: string[] = [];
  const out = lines.filter((line, index) => {
    const t = cleanLine(line);
    const top = t.match(TOP_LEVEL_HEADING_RE);
    if (top) inSectionOne = top[1] === "1";
    if (index > 0 && inSectionOne && normalizeKey(t) === normalizeKey(title)) {
      repairs.push("section1:duplicate_title_removed");
      return false;
    }
    return true;
  });
  return { text: out.join("\n"), repairs };
}

function stripTemplatePlaceholders(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out = text
    .split("\n")
    .filter((line) => {
      const t = cleanLine(line);
      if (/^\[(?:not yet specified|tbd|todo|placeholder)[^\]]*\]$/i.test(t)) {
        repairs.push("placeholder:bracket_line_removed");
        return false;
      }
      if (/^(?:tbd|to be determined|not yet specified|insert here)\.?$/i.test(t)) {
        repairs.push("placeholder:line_removed");
        return false;
      }
      if (/this draft agreement preview is generated from your structured fields/i.test(t)) {
        repairs.push("starter_template:preview_banner_removed");
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\[(?:Not yet specified|TBD|TODO|PLACEHOLDER)\]/gi, "");
  return { text: out, repairs };
}

function stripDuplicateParagraphs(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const blocks = text.split(/\n{2,}/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const key = normalizeKey(block);
    if (key.length > 40 && seen.has(key)) {
      repairs.push(`duplicate_clause:${key.slice(0, 48)}`);
      continue;
    }
    if (key) seen.add(key);
    out.push(block);
  }
  return { text: out.join("\n\n"), repairs };
}

function stripDuplicateLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const key = normalizeKey(line);
    const isSubstantive = key.length > 36 && !isNumberedHeading(line);
    if (isSubstantive && seen.has(key)) {
      repairs.push(`duplicate_line:${key.slice(0, 48)}`);
      continue;
    }
    if (isSubstantive) seen.add(key);
    out.push(line);
  }
  return { text: out.join("\n"), repairs };
}

function canonicalizeRepeatedESignature(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let seen = false;
  const out = text
    .split(/\n{2,}/)
    .map((block) => {
      if (/electronic signatures and counterparts/i.test(block)) {
        block = block.replace(
          /The parties may execute this Agreement using electronic signatures and counterparts\./gi,
          "The parties may execute this Agreement electronically and in counterparts.",
        );
      }
      return block;
    })
    .filter((block) => {
      const key = normalizeKey(block);
      const electronicSignature =
        /\belectronic signatures?\b/.test(key) ||
        (/\bcounterparts?\b/.test(key) && /\belectronic\b|\besign\b|e-sign/.test(key));
      if (!electronicSignature) return true;
      if (!seen) {
        seen = true;
        return true;
      }
      repairs.push("duplicate:e_signature_clause_removed");
      return false;
    })
    .join("\n\n");
  return { text: out, repairs };
}

function normalizePaymentConsistency(text: string): { text: string; repairs: string[]; warnings: string[] } {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const lines = text.split("\n");
  let canonicalNet: string | null = null;
  const out = lines.map((line) => {
    const paymentContext = /\b(payment|invoice|fee|compensation|commercial terms)\b/i.test(line);
    const net = line.match(/\bNet\s+(\d{1,3})\b/i);
    if (!paymentContext || !net) return line;
    const found = net[1];
    if (!canonicalNet) {
      canonicalNet = found;
      return line;
    }
    if (found !== canonicalNet) {
      repairs.push(`payment_terms:net_${found}_normalized_to_net_${canonicalNet}`);
      warnings.push("payment_terms_conflict_resolved");
      return line.replace(/\bNet\s+\d{1,3}\b/gi, `Net ${canonicalNet}`);
    }
    return line;
  });
  return { text: out.join("\n"), repairs, warnings };
}

function normalizeTerminationNoticeConsistency(text: string): { text: string; repairs: string[]; warnings: string[] } {
  const repairs: string[] = [];
  const warnings: string[] = [];
  const lines = text.split("\n");
  let canonicalDays: string | null = null;
  const out = lines.map((line) => {
    const terminationContext = /\b(termination|terminate|notice)\b/i.test(line);
    const days = line.match(/\b(\d{1,3})\s+days?\b/i);
    if (!terminationContext || !days) return line;
    const found = days[1];
    if (!canonicalDays) {
      canonicalDays = found;
      return line;
    }
    if (found !== canonicalDays) {
      repairs.push(`termination_notice:${found}_days_normalized_to_${canonicalDays}_days`);
      warnings.push("termination_notice_conflict_resolved");
      return line.replace(/\b\d{1,3}\s+days?\b/gi, `${canonicalDays} days`);
    }
    return line;
  });
  return { text: out.join("\n"), repairs, warnings };
}

function stripOrphanFragments(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out = text
    .split("\n")
    .filter((line) => {
      const t = cleanLine(line);
      if (!t) return true;
      if (/^(?:and|or|provided,? however|except that|subject to)\b/i.test(t) && t.length < 80) {
        repairs.push(`orphan_fragment:${t.slice(0, 48)}`);
        return false;
      }
      if (/^[).,;:-]+/.test(t)) {
        repairs.push(`orphan_punctuation:${t.slice(0, 48)}`);
        return false;
      }
      return true;
    })
    .join("\n");
  return { text: out, repairs };
}

export function canonicalizeProAgreementText(text: string): ProAgreementCanonicalizationResult {
  const repairs: string[] = [];
  const warnings: string[] = [];
  let out = (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const step of [
    stripTemplatePlaceholders,
    stripRepeatedTitleInsideSectionOne,
    stripEmptyNumberedHeadings,
    stripOrphanFragments,
    stripDuplicateParagraphs,
    stripDuplicateLines,
    canonicalizeRepeatedESignature,
    stripEmptyNumberedHeadings,
  ]) {
    const result = step(out);
    out = result.text;
    repairs.push(...result.repairs);
  }

  const payment = normalizePaymentConsistency(out);
  out = payment.text;
  repairs.push(...payment.repairs);
  warnings.push(...payment.warnings);

  const termination = normalizeTerminationNoticeConsistency(out);
  out = termination.text;
  repairs.push(...termination.repairs);
  warnings.push(...termination.warnings);

  out = out
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: out, repairs: [...new Set(repairs)], warnings: [...new Set(warnings)] };
}
