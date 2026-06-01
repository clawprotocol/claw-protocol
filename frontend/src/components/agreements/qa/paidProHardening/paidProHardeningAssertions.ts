import { expect } from "vitest";
import { PAID_PRO_MUTUAL_CONSULTING_TITLE } from "../../paidProOpeningRecitalGuard";

export const FUSED_EFFECTIVE_DATE_THIS_AGREEMENT_RE =
  /Effective\s+Date\s+This\s+Agreement\s+is\s+between/i;

export const CANONICAL_BY_AND_BETWEEN_RE =
  /entered\s+into\s+as\s+of\s+the\s+Effective\s+Date\s+by\s+and\s+between/i;

export const LEGACY_ENTITY_INLINE_SIGNATURE_RE =
  /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Limited)\s+Signature:\s*_{1,}\s*Date:\s*_{1,}/i;

const INTELLIGENCE_CALLOUT_RES: readonly RegExp[] = [
  /Professional services shape/i,
  /Software-style commercial terms/i,
  /Drafted from your deal description/i,
];

export function countRegexMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  return (text.match(global) ?? []).length;
}

function countStandaloneMutualConsultingTitleLines(text: string): number {
  return text
    .split("\n")
    .filter((line) => /^MUTUAL\s+CONSULTING\s+AND\s+IMPLEMENTATION\s+AGREEMENT\s*$/i.test(line.trim()))
    .length;
}

export function assertPaidProOpeningRecitalOnce(text: string): void {
  expect(text).toContain(PAID_PRO_MUTUAL_CONSULTING_TITLE);
  expect(countStandaloneMutualConsultingTitleLines(text)).toBe(1);
  expect(text).toMatch(CANONICAL_BY_AND_BETWEEN_RE);
  expect(countRegexMatches(text, CANONICAL_BY_AND_BETWEEN_RE)).toBe(1);
  expect(text).not.toMatch(FUSED_EFFECTIVE_DATE_THIS_AGREEMENT_RE);
  expect(text).toMatch(/collectively as the ["']Parties/i);
}

export function assertNoLegacyEntitySignatureTailLines(text: string): void {
  expect(text).not.toMatch(LEGACY_ENTITY_INLINE_SIGNATURE_RE);
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    expect(trimmed).not.toMatch(
      /^(?:Blue Canyon|Iron Vale)[\s\S]{0,80}\s+Signature:\s*_{1,}\s*Date:\s*_{1,}\s*$/i,
    );
  }
}

export function assertSignatureNameFieldsExcludeLegalEntities(
  text: string,
  legalNames: readonly string[],
): void {
  const legalLower = legalNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
  for (const line of text.split("\n")) {
    const match = line.match(/^(\s*)Name:\s*(.+)$/i);
    if (!match) continue;
    const value = match[2].trim();
    if (!value || /_{4,}/.test(value)) continue;
    const valueLower = value.toLowerCase();
    for (const legal of legalLower) {
      expect(
        valueLower === legal || (legal.length >= 8 && valueLower.includes(legal)),
      ).toBe(false);
    }
  }
}

export function assertSectionNumberingIntactAfterRecitalRepair(text: string): void {
  const sec1 = text.search(/^\s*1\.\s+/m);
  const byAndBetween = text.search(CANONICAL_BY_AND_BETWEEN_RE);
  expect(sec1).toBeGreaterThanOrEqual(0);
  expect(byAndBetween).toBeGreaterThanOrEqual(0);
  expect(sec1).toBeGreaterThan(byAndBetween);
  expect(text).toMatch(/^\s*2\.\s+/m);
  expect(text).toMatch(/^\s*10\.\s+/m);
}

export function assertNoQaIntelligenceCalloutsInLegalCorpus(text: string): void {
  for (const re of INTELLIGENCE_CALLOUT_RES) {
    expect(text).not.toMatch(re);
  }
}

export function assertPaidProOperativeBodyParity(
  fingerprints: Record<string, string>,
): void {
  const values = Object.values(fingerprints);
  const [first, ...rest] = values;
  for (const fp of rest) {
    expect(fp).toBe(first);
  }
}
