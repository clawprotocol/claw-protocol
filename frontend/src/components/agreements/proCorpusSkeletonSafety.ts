/**
 * Pro corpus skeleton-clause detection, repair, and test invariants.
 * Used by canonicalizeProAgreementText() and downstream corpus tests.
 */

/** Sue Lee live QA corpus with bare headings, duplicate notices, and billing filler. */
export const SUE_LEE_QA_BAD_CORPUS = `AI Automation Services Agreement

This Agreement is between Sue Lee ("Client") and Example Provider LLC ("Service Provider").

1. Purpose and Scope

2. Fees and Payment
2.1 Total project fee is $120,000 USD.
Invoices are payable Net 30.
Invoices will be sent to the billing contact identified in the Notices section.

3. Confidentiality
3.1 Each party shall protect confidential information.

4. Ownership and Work Product
4.1 Service Provider tools and know-how.
4.2 Client owns deliverables upon full payment.

5. Confidentiality Obligations
5.2 Required disclosure.

6. Term and Termination
6.1 Either party may terminate on thirty (30) days written notice.

7. Notices
7.1 Notices may be delivered electronically to the addresses on file.

8. Miscellaneous
8.1 Notices
8.2 The parties may execute this Agreement using electronic signatures and counterparts.

9. Electronic Signatures and Counterparts
The parties may execute this Agreement electronically and in counterparts.

IN WITNESS WHEREOF, the Parties execute this Agreement.
`;

const NUMBERED_CLAUSE_LINE_RE = /^(\d+(?:\.\d+)*)\.?\s+(.+)$/;
const TOP_LEVEL_SECTION_RE = /^(\d+)\.\s+(.+)$/;
const BILLING_NOTICES_FILLER_RE =
  /Invoices will be sent to the billing contact identified in the Notices section\.?/i;

const SKELETON_HEADING_HYDRATION: ReadonlyArray<{ match: RegExp; text: string }> = [
  {
    match: /purpose\s+and\s+scope/i,
    text: "The scope of services and deliverables under this Agreement are as set forth in the operative sections and schedules below.",
  },
  {
    match: /service\s+provider\s+tools\s+and\s+know[- ]?how/i,
    text: "Service Provider retains ownership of its pre-existing tools, templates, and know-how, excluding Client-specific deliverables paid for in full.",
  },
  {
    match: /required\s+disclosure/i,
    text: "Each party will disclose information only as required by law or as expressly permitted under this Agreement.",
  },
  {
    match: /^notices$/i,
    text: "Formal notices under this Agreement must be delivered to the addresses or emails identified for each party.",
  },
];

export function cleanProCorpusLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function headingTitleFromLine(line: string): string {
  const t = cleanProCorpusLine(line);
  const m = t.match(NUMBERED_CLAUSE_LINE_RE);
  if (!m) return t;
  return m[2].replace(/\.\s*$/, "").trim();
}

function lineHasInlineClauseBody(line: string): boolean {
  const t = cleanProCorpusLine(line);
  const m = t.match(NUMBERED_CLAUSE_LINE_RE);
  if (!m) return false;
  const rest = m[2].trim();
  if (/^[^.]+\.\s+(.{20,})/.test(rest)) return true;
  if (rest.length >= 42 && /\b(?:shall|will|must|may|owns?|agrees?|pays?|provides?|delivered|terminat)\b/i.test(rest)) {
    return true;
  }
  return false;
}

export function isProClauseHeadingLine(line: string): boolean {
  const t = cleanProCorpusLine(line);
  if (!t || lineHasInlineClauseBody(line)) return false;
  const m = t.match(NUMBERED_CLAUSE_LINE_RE);
  if (!m) return false;
  const title = headingTitleFromLine(line);
  if (!title || title.length > 120) return false;
  return /[A-Za-z]/.test(title);
}

function parseClauseNumber(line: string): string | null {
  const m = cleanProCorpusLine(line).match(/^(\d+(?:\.\d+)*)/);
  return m?.[1] ?? null;
}

function isSubsectionHeadingLine(line: string): boolean {
  const num = parseClauseNumber(line);
  return Boolean(num && num.includes("."));
}

function isTopLevelSectionLine(line: string): boolean {
  const num = parseClauseNumber(line);
  return Boolean(num && !num.includes("."));
}

export function isBareSkeletonHeadingAt(lines: string[], index: number): boolean {
  const current = lines[index] ?? "";
  if (!isProClauseHeadingLine(current) || lineHasInlineClauseBody(current)) return false;

  for (let i = index + 1; i < lines.length; i++) {
    const t = cleanProCorpusLine(lines[i]);
    if (!t) continue;
    if (isProClauseHeadingLine(lines[i]) && !lineHasInlineClauseBody(lines[i])) {
      return true;
    }
    if (lineHasInlineClauseBody(lines[i])) {
      if (isSubsectionHeadingLine(current) && isSubsectionHeadingLine(lines[i])) continue;
      return false;
    }
    if (!isProClauseHeadingLine(lines[i])) return false;
    if (isTopLevelSectionLine(lines[i])) return true;
  }
  return true;
}

function tryHydrateSkeletonHeading(title: string): string | null {
  const normalized = title.trim();
  for (const entry of SKELETON_HEADING_HYDRATION) {
    if (entry.match.test(normalized)) return entry.text;
  }
  return null;
}

export function repairBareProSkeletonClauses(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!isBareSkeletonHeadingAt(lines, i)) {
      out.push(line);
      continue;
    }
    const title = headingTitleFromLine(line);
    const hydration = tryHydrateSkeletonHeading(title);
    if (hydration) {
      out.push(line);
      out.push(hydration);
      repairs.push(`skeleton_heading:hydrated:${title.slice(0, 40)}`);
      continue;
    }
    repairs.push(`empty_heading:${cleanProCorpusLine(line).slice(0, 48)}`);
  }

  return { text: out.join("\n"), repairs };
}

function blockHasMaterialNoticeContact(lines: string[]): boolean {
  const joined = lines.join("\n");
  return (
    /@/.test(joined) ||
    /\b(?:street|avenue|road|suite|floor|attn|attention|phone|fax)\b/i.test(joined) ||
    /\b\d{3,}[\s-]?\w+/.test(joined)
  );
}

export function consolidateDuplicateNoticesSections(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.split("\n");
  const hasTopLevelNotices = lines.some((line) => /^7\.\s+Notices\b/i.test(cleanProCorpusLine(line)));
  if (!hasTopLevelNotices) return { text, repairs };

  const remove = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const t = cleanProCorpusLine(lines[i]);
    if (!/^8\.\d+\.?\s+Notices\b/i.test(t) && !/^8\.\s+Notices\b/i.test(t)) continue;

    const blockLines: string[] = [];
    const blockIndices: number[] = [];
    for (let j = i; j < lines.length; j++) {
      const bt = cleanProCorpusLine(lines[j]);
      if (j > i && (/^\d+\.\s+/.test(bt) || /^IN WITNESS WHEREOF/i.test(bt))) break;
      blockLines.push(lines[j] ?? "");
      blockIndices.push(j);
    }
    if (!blockHasMaterialNoticeContact(blockLines)) {
      for (const idx of blockIndices) remove.add(idx);
      repairs.push("notices:duplicate_subsection_removed");
    } else {
      repairs.push("notices:duplicate_subsection_retained_material");
    }
  }

  if (remove.size === 0) return { text, repairs };
  return {
    text: lines.filter((_, idx) => !remove.has(idx)).join("\n"),
    repairs,
  };
}

export function corpusHasBillingContact(text: string): boolean {
  const lines = text.split("\n");
  let inNotices = false;
  const noticesLines: string[] = [];
  for (const line of lines) {
    const t = cleanProCorpusLine(line);
    const top = t.match(TOP_LEVEL_SECTION_RE);
    if (top) {
      inNotices = /^notices$/i.test(top[2].replace(/\.\s*$/, "").trim());
      if (!inNotices && noticesLines.length > 0) break;
      continue;
    }
    if (inNotices && t) noticesLines.push(t);
  }
  if (noticesLines.length === 0) return false;
  return blockHasMaterialNoticeContact(noticesLines);
}

export function stripBillingNoticesFiller(text: string): { text: string; repairs: string[] } {
  if (!BILLING_NOTICES_FILLER_RE.test(text)) return { text, repairs: [] };
  if (corpusHasBillingContact(text)) return { text, repairs: [] };
  return {
    text: text
      .split("\n")
      .filter((line) => !BILLING_NOTICES_FILLER_RE.test(cleanProCorpusLine(line)))
      .join("\n"),
    repairs: ["filler:billing_notices_without_contact_removed"],
  };
}

export function stripWeakElectronicSignatureFluff(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out = text.split("\n").filter((line) => {
    const t = cleanProCorpusLine(line);
    if (/^the parties agree that e-signatures and counterparts are valid\.?$/i.test(t)) {
      repairs.push("filler:miscellaneous_esign_fluff_removed");
      return false;
    }
    if (/^electronic signatures are permitted\.?$/i.test(t)) {
      repairs.push("filler:electronic_signatures_permitted_removed");
      return false;
    }
    return true;
  });
  return { text: out.join("\n"), repairs };
}

export function dedupeElectronicSignatureLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let seen = false;
  const out = text.split("\n").filter((line) => {
    const key = cleanProCorpusLine(line).toLowerCase();
    if (key.length < 16) return true;
    const isEsign =
      /\belectronic signatures?\b/.test(key) ||
      /\be-signatures?\b/.test(key) ||
      /\belectronic signatures? and counterparts\b/.test(key) ||
      (/\bcounterparts?\b/.test(key) && (/\belectronic\b/.test(key) || /\besign\b/.test(key) || /e-sign/.test(key)));
    if (!isEsign) return true;
    if (!seen) {
      seen = true;
      return true;
    }
    repairs.push(`duplicate:e_signature_line_removed`);
    return false;
  });
  return { text: out.join("\n"), repairs };
}

export function assertNoBareProSkeletonClauses(text: string): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (isBareSkeletonHeadingAt(lines, i)) {
      violations.push(`bare_skeleton_heading:${cleanProCorpusLine(lines[i])}`);
    }
  }

  if (/^1\.\s+Purpose and Scope\s*(?:\n\s*)*\d+\./m.test(normalized)) {
    violations.push("empty_purpose_section_before_next_heading");
  }
  if (/^4\.1\s+Service Provider tools and know-how\.\s*(?:\n\s*)*(?:\d+\.|$)/im.test(normalized)) {
    const idx = lines.findIndex((l) => /^4\.1\s+Service Provider tools and know-how\.?\s*$/i.test(cleanProCorpusLine(l)));
    if (idx >= 0 && isBareSkeletonHeadingAt(lines, idx)) {
      violations.push("bare_4_1_tools_and_knowhow");
    }
  }
  if (/^5\.2\s+Required disclosure\.\s*(?:\n\s*)*(?:\d+\.|$)/im.test(normalized)) {
    const idx = lines.findIndex((l) => /^5\.2\s+Required disclosure\.?\s*$/i.test(cleanProCorpusLine(l)));
    if (idx >= 0 && isBareSkeletonHeadingAt(lines, idx)) {
      violations.push("bare_5_2_required_disclosure");
    }
  }

  if (BILLING_NOTICES_FILLER_RE.test(normalized) && !corpusHasBillingContact(normalized)) {
    violations.push("billing_notices_filler_without_contact");
  }

  const esignClauseLines = lines.filter((line) => {
    const key = cleanProCorpusLine(line).toLowerCase();
    return (
      key.length >= 24 &&
      (/\belectronic signatures?\b/.test(key) || /\be-signatures?\b/.test(key)) &&
      /\b(?:execute|counterparts?|valid)\b/.test(key)
    );
  });
  if (esignClauseLines.length > 1) {
    violations.push("duplicate_electronic_signature_language");
  }

  const topNotices = (normalized.match(/^7\.\s+Notices\b/gim) ?? []).length;
  const lateNotices = (normalized.match(/^8\.\d+\.?\s+Notices\b/gim) ?? []).length;
  if (topNotices > 0 && lateNotices > 0) {
    violations.push("duplicate_notices_sections");
  }

  return { ok: violations.length === 0, violations };
}
