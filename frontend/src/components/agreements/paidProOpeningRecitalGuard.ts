/**
 * Paid Pro services agreement opening guard — ensures title + recital precede Section 1.
 * Runs at corpus acceptance (before SoT, review, copy, export, signer setup).
 */

import {
  PARTY_ENTITY_SUFFIX_RE,
  type CanonicalPartyIdentityRecord,
  definedMultiPartyAgreementOpeningLine,
  repairAdjacentDuplicatePartyNamesInOpening,
} from "./canonicalPartyIdentityResolver";

import {
  resolveAgreementTitleFromIntakeScope,
  isAuthoritativePaidProAgreementDocumentTitleLine,
  type AgreementTitleScopeDecision,
} from "./paidProAgreementTitleScope";
import { repairPaidProDocumentTitleOpening } from "./paidProDocumentTitleOpeningRepair";

export const PAID_PRO_MUTUAL_CONSULTING_TITLE = "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT";
export const PAID_PRO_CONSULTING_TITLE = "CONSULTING AND IMPLEMENTATION AGREEMENT";
export const PAID_PRO_CONSULTING_SERVICES_TITLE = "CONSULTING SERVICES AGREEMENT";
export const PAID_PRO_SERVICES_TITLE = "SERVICES AGREEMENT";

const PAID_PRO_CANONICAL_TITLE_RE =
  /(?:MUTUAL\s+)?(?:CONSULTING\s+SERVICES|BUSINESS\s+CONSULTING|CONSULTING\s+AND\s+IMPLEMENTATION|SERVICES)\s+AGREEMENT/i;

export function resolvePaidProServicesAgreementTitle(intakeText?: string | null): string {
  return resolveAgreementTitleFromIntakeScope(intakeText).titleUpper;
}

function recitalAgreementPhrase(title: string): string {
  const upper = title.toUpperCase();
  if (/MUTUAL\s+CONSULTING\s+AND\s+IMPLEMENTATION/i.test(upper)) {
    return "Mutual Consulting and Implementation Agreement";
  }
  if (/CONSULTING\s+AND\s+IMPLEMENTATION/i.test(upper)) {
    return "Consulting and Implementation Agreement";
  }
  if (/MUTUAL\s+CONSULTING\s+SERVICES/i.test(upper)) {
    return "Mutual Consulting Services Agreement";
  }
  if (/BUSINESS\s+CONSULTING/i.test(upper)) {
    return "Business Consulting Agreement";
  }
  if (/CONSULTING\s+SERVICES/i.test(upper)) {
    return "Consulting Services Agreement";
  }
  if (/MUTUAL\s+SERVICES/i.test(upper)) {
    return "Mutual Services Agreement";
  }
  if (/MANUFACTURING,\s+DISTRIBUTION,\s+LICENSING/i.test(upper)) {
    return "Manufacturing, Distribution, Licensing and Marketing Services Agreement";
  }
  return "Services Agreement";
}

export function paidProTitleScopeDecision(intakeText?: string | null): AgreementTitleScopeDecision {
  return resolveAgreementTitleFromIntakeScope(intakeText);
}

export function buildCanonicalPaidProServicesOpeningRecital(
  client: CanonicalPartyIdentityRecord,
  provider: CanonicalPartyIdentityRecord,
  intakeText?: string | null,
): string {
  const clientName = client.fullLegalName.trim();
  const providerName = provider.fullLegalName.trim();
  const title = resolvePaidProServicesAgreementTitle(intakeText);
  const phrase = recitalAgreementPhrase(title);
  return [
    title,
    "",
    `This ${phrase} (this "Agreement") is entered into as of the Effective Date by and between ${clientName} ("Client") and ${providerName} ("Service Provider"). Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties."`,
    "",
  ].join("\n");
}

const RECITAL_LINE_RE =
  /^(?:This\s+)?(?:Mutual\s+)?(?:Consulting|Services|Professional)[\s\S]{0,220}?(?:Agreement|Contract)\b/i;

function meaningfulLines(text: string, max = 8): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

function isStandalonePartyEntityLine(line: string, legalNames: ReadonlySet<string>): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (!PARTY_ENTITY_SUFFIX_RE.test(trimmed)) return false;
  if (RECITAL_LINE_RE.test(trimmed)) return false;
  if (/^\d+\.\s/.test(trimmed)) return false;
  return legalNames.has(trimmed.toLowerCase());
}

const OPENING_SECTION_ONE_SCAN_MAX = 8_000;

/** Section 1 anchors used for opening repair — line-start or inline in flattened server bodies. */
function findOpeningSectionOneIndex(text: string): number {
  const head = (text || "").replace(/\r\n/g, "\n").slice(0, OPENING_SECTION_ONE_SCAN_MAX);
  const lineStart = head.search(/^\s*1\.\s+(?!\d)/m);
  if (lineStart >= 0) return lineStart;
  const inline = head.match(/(?:^|\s)(1\.\s+(?!\d+\.\d)[A-Z])/);
  if (!inline || inline.index == null) return -1;
  return inline.index + inline[0].length - inline[1].length;
}

function splitOperativeAndExecutionTail(body: string): { operative: string; executionTail: string } {
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) {
    return { operative: body, executionTail: "" };
  }
  return {
    operative: body.slice(0, witnessIdx).trimEnd(),
    executionTail: body.slice(witnessIdx).trimStart(),
  };
}

function openingSliceBeforeSection1(text: string): string {
  const match = findOpeningSectionOneIndex(text);
  return match >= 0 ? text.slice(0, match) : text.slice(0, 2_500);
}

/**
 * Preserve substantive numbered sections that appear before the first Section 1 anchor.
 * Wire malformations may insert commercial sections (e.g. Revenue Allocation) ahead of Section 1.
 */
function extractPreservedNumberedOperativePrefixBeforeSectionOne(
  operative: string,
  sec1Idx: number,
): string {
  if (sec1Idx <= 0) return "";
  const prefix = operative.slice(0, sec1Idx).trim();
  if (!prefix) return "";

  const numberedSectionRe = /^\s*(\d+)\.\s+(?!\d+\.)([A-Z])/gm;
  const matches = [...prefix.matchAll(numberedSectionRe)];
  if (matches.length === 0) return "";

  const blocks: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i]!;
    const sectionNum = Number(m[1]);
    if (!Number.isFinite(sectionNum) || sectionNum <= 1) continue;
    const start = m.index ?? 0;
    const nextStart =
      i + 1 < matches.length ? (matches[i + 1]!.index ?? prefix.length) : prefix.length;
    const block = prefix.slice(start, nextStart).trim();
    if (block) blocks.push(block);
  }
  return blocks.join("\n\n").trim();
}

const OPENING_RECITAL_LINE_RE =
  /^(?:This\b.+\bAgreement\b|\bThis Agreement is between\b)/i;
const OPENING_RECITAL_BODY_RE =
  /\b(?:entered\s+into|is\s+between|by\s+and\s+between|by\s+and\s+among)\b/i;

/**
 * Preserve commercial operative content before Section 1 when opening repair rewrites the
 * title/recital. Covers numbered pre-§1 sections and unnumbered heading blocks (e.g. markdown
 * "## Fees" stripped to "Fees") that would otherwise be discarded with the old opening.
 */
function extractPreservedOperativePrefixBeforeSectionOne(operative: string, sec1Idx: number): string {
  if (sec1Idx <= 0) return "";
  const numbered = extractPreservedNumberedOperativePrefixBeforeSectionOne(operative, sec1Idx);
  if (numbered) return numbered;

  const prefix = operative.slice(0, sec1Idx).replace(/\r\n/g, "\n");
  if (!prefix.trim()) return "";

  const lines = prefix.split("\n");
  let idx = 0;
  while (idx < lines.length) {
    const t = (lines[idx] ?? "").trim();
    if (!t) {
      idx += 1;
      continue;
    }
    if (PAID_PRO_CANONICAL_TITLE_RE.test(t) || /AGREEMENT\s*$/i.test(t)) {
      idx += 1;
      continue;
    }
    break;
  }
  while (idx < lines.length) {
    const t = (lines[idx] ?? "").trim();
    if (!t) {
      idx += 1;
      continue;
    }
    const isRecital =
      OPENING_RECITAL_LINE_RE.test(t) ||
      (OPENING_RECITAL_BODY_RE.test(t) && /\b(?:Agreement|Party|Parties)\b/i.test(t));
    if (!isRecital) break;
    idx += 1;
    while (idx < lines.length && !(lines[idx] ?? "").trim()) idx += 1;
    break;
  }

  const rest = lines.slice(idx).join("\n").trim();
  return rest.length >= 20 ? rest : "";
}

/** True when paid Pro services corpus lacks a valid title + recital before Section 1. */
export function detectPaidProMalformedServicesOpening(
  text: string,
  records?: readonly CanonicalPartyIdentityRecord[],
): boolean {
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return true;

  const openingScan = body.slice(0, 6_000);
  if (/\(\s*["']?party["']?\s*\)/i.test(openingScan)) {
    return true;
  }

  const client = records?.[0]?.fullLegalName.trim() ?? "";
  const provider = records?.[1]?.fullLegalName.trim() ?? "";
  const legalNames = new Set(
    [client, provider].filter(Boolean).map((name) => name.toLowerCase()),
  );

  const lines = meaningfulLines(body, 6);
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";

  if (/^This Agreement is between/i.test(first)) {
    const hasTitleLater = body
      .slice(0, 4_000)
      .split("\n")
      .some((line) => /(?:CONSULTING|SERVICES|MUTUAL).*AGREEMENT/i.test(line.trim()));
    if (hasTitleLater) return true;
  }

  if (legalNames.size >= 1 && isStandalonePartyEntityLine(first, legalNames)) {
    return true;
  }
  if (/^\d+\.\s/.test(first)) {
    return true;
  }
  if (isStandalonePartyEntityLine(first, legalNames) && /^\d+\.\s/.test(second)) {
    return true;
  }

  const preSec1 = openingSliceBeforeSection1(body);
  const sec1Idx = findOpeningSectionOneIndex(body);
  const openingScanRegion = sec1Idx >= 0 ? preSec1 : body.slice(0, 4_000);
  const titleCount = (openingScanRegion.match(PAID_PRO_CANONICAL_TITLE_RE) ?? []).length;
  const enteredCount = (openingScanRegion.match(/\bentered\s+into\b/gi) ?? []).length;
  const betweenCount = (openingScanRegion.match(/\bis\s+between\b/gi) ?? []).length;
  if (titleCount > 1 || enteredCount > 1 || betweenCount > 1) {
    return true;
  }
  if (/\bSERVICES\s+AGREEMENT\s+This\s+Agreement\b/i.test(openingScanRegion)) {
    return true;
  }
  if (/This\s+[\w\s]+Agreement[\s\S]{0,160}?This\s+Agreement\s+is\s+between/i.test(openingScanRegion)) {
    return true;
  }

  const hasValidRecitalVerb = (region: string): boolean =>
    /\bentered\s+into\b/i.test(region) ||
    /\bis\s+between\b/i.test(region) ||
    /\bby\s+and\s+between\b/i.test(region) ||
    /\bby\s+and\s+among\b/i.test(region) ||
    /\bentered\s+by\s+and\s+between\b/i.test(region);

  if (sec1Idx < 0) {
    return !hasValidRecitalVerb(body.slice(0, 2_500));
  }

  if (!hasValidRecitalVerb(preSec1)) {
    return true;
  }
  if (client && !preSec1.includes(client)) {
    return true;
  }
  if (provider && !preSec1.includes(provider)) {
    return true;
  }
  if (!/\(\s*["']?Client["']?\s*\)/i.test(preSec1)) {
    return true;
  }
  // Accept intake role aliases (Provider / Service Provider) — commercial role-alias preserve.
  if (!/\(\s*["']?(?:Service\s+Provider|Provider)["']?\s*\)/i.test(preSec1)) {
    return true;
  }
  if (/Effective\s+Date\s+This\s+Agreement\s+is\s+between/i.test(preSec1)) {
    return true;
  }
  if (!/MUTUAL\s+CONSULTING\s+AND\s+IMPLEMENTATION\s+AGREEMENT/i.test(preSec1)) {
    if (!PAID_PRO_CANONICAL_TITLE_RE.test(preSec1)) {
      const trimmedPre = preSec1.trim();
      if (trimmedPre.length < 120 || isStandalonePartyEntityLine(first, legalNames)) {
        return true;
      }
    }
  }

  return false;
}

export function isPaidProOpeningStructurallyValid(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  if (records.length < 2) return false;
  if (detectPaidProMalformedServicesOpening(text, records)) return false;

  const body = (text || "").replace(/\r\n/g, "\n");
  const head = body.slice(0, 3_500);
  const client = records[0]!.fullLegalName.trim();
  const provider = records[1]!.fullLegalName.trim();

  if (!PAID_PRO_CANONICAL_TITLE_RE.test(head)) {
    return false;
  }
  if (!/entered\s+into\s+as\s+of/i.test(head)) {
    return false;
  }
  if (!head.includes(client) || !head.includes(provider)) {
    return false;
  }
  if (!/\(\s*["']?Client["']?\s*\)/i.test(head) || !/\(\s*["']?Service Provider["']?\s*\)/i.test(head)) {
    return false;
  }

  const first = meaningfulLines(body, 1)[0] ?? "";
  if (first === client || first === provider) {
    return false;
  }

  const sec1Idx = findOpeningSectionOneIndex(body);
  const enteredIdx = head.search(/entered\s+into/i);
  if (sec1Idx >= 0 && (enteredIdx < 0 || enteredIdx > sec1Idx)) {
    return false;
  }

  return true;
}

function stripLeadingStandalonePartyLines(
  body: string,
  legalNames: ReadonlySet<string>,
): { text: string; stripped: number } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let idx = 0;
  let stripped = 0;
  while (idx < lines.length) {
    const trimmed = (lines[idx] ?? "").trim();
    if (!trimmed) {
      idx += 1;
      continue;
    }
    if (isStandalonePartyEntityLine(trimmed, legalNames)) {
      stripped += 1;
      idx += 1;
      continue;
    }
    break;
  }
  if (stripped === 0) {
    return { text: body, stripped: 0 };
  }
  return { text: lines.slice(idx).join("\n").trim(), stripped };
}

/**
 * Prepend canonical mutual consulting title + recital; drop naked party-name header lines.
 */
export function repairPaidProServicesAgreementOpening(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
  intakeText?: string | null,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  if (records.length < 2) {
    return { text, repairs };
  }

  const client = records[0]!;
  const provider = records[1]!;
  const legalNames = new Set(
    [client.fullLegalName, provider.fullLegalName]
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  );

  let body = (text || "").replace(/\r\n/g, "\n").trim();
  const stripped = stripLeadingStandalonePartyLines(body, legalNames);
  if (stripped.stripped > 0) {
    body = stripped.text;
    repairs.push("opening:strip_naked_party_header");
  }

  if (isPaidProOpeningStructurallyValid(body, records)) {
    return { text: body, repairs };
  }

  const { operative, executionTail } = splitOperativeAndExecutionTail(body);
  const sec1Idx = findOpeningSectionOneIndex(operative);
  const preservedPrefix = extractPreservedOperativePrefixBeforeSectionOne(operative, sec1Idx);
  const operativeRemainder = sec1Idx >= 0 ? operative.slice(sec1Idx).trim() : operative;
  const remainderBody = preservedPrefix
    ? `${preservedPrefix}\n\n${operativeRemainder}`.replace(/\n{3,}/g, "\n\n").trim()
    : operativeRemainder;
  const remainder = executionTail
    ? `${remainderBody}\n\n${executionTail}`.replace(/\n{3,}/g, "\n\n").trim()
    : remainderBody;
  const opening = buildCanonicalPaidProServicesOpeningRecital(client, provider, intakeText);
  repairs.push("opening:prepend_canonical_services_recital");
  if (preservedPrefix) repairs.push("opening:preserve_pre_section_one_operative_blocks");
  return { text: `${opening}${remainder}`, repairs };
}

export function buildCanonicalPaidProMultiPartyOpeningRecital(
  records: readonly CanonicalPartyIdentityRecord[],
  intakeText?: string | null,
  titleOverride?: string | null,
): string {
  const title = (titleOverride || "").trim() || resolvePaidProServicesAgreementTitle(intakeText);
  const mutual = /MUTUAL/i.test(title);
  const openingLine = definedMultiPartyAgreementOpeningLine(records, {
    consulting: /CONSULTING/i.test(title),
    mutual,
  });
  return [title, "", openingLine, ""].join("\n");
}

/** True when multi-party opening has duplicate recitals or wrong defined terms before Section 1. */
export function detectPaidProMalformedMultiPartyOpening(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  if (records.length < 3) return false;
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return true;
  const preSec1 = openingSliceBeforeSection1(body);
  const openingScan =
    preSec1.trim().length >= 40 ? preSec1 : body.slice(0, Math.min(body.length, 6_000));
  const enteredCount = (openingScan.match(/\bentered\s+into\b/gi) ?? []).length;
  const amongCount = (openingScan.match(/\bby\s+and\s+among\b/gi) ?? []).length;
  const betweenCount = (openingScan.match(/\bby\s+and\s+between\b/gi) ?? []).length;
  if (enteredCount > 1 || (amongCount > 0 && betweenCount > 0)) return true;
  if (records.some((r) => !openingScan.includes(r.fullLegalName.trim()))) return true;
  const roleMarks = records.filter((r) => {
    const role = r.roleLabel.trim();
    if (!role || role.toLowerCase() === r.fullLegalName.trim().toLowerCase()) return false;
    return new RegExp(`\\(\\s*["']?${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*\\)`, "i").test(
      openingScan,
    );
  });
  if (roleMarks.length < Math.min(2, records.length)) return true;
  for (const record of records) {
    const name = record.fullLegalName.trim();
    if (
      new RegExp(
        `${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i",
      ).test(openingScan)
    ) {
      return true;
    }
  }
  return false;
}

function readCorpusDocumentTitleUpper(text: string): string | null {
  const titleRepair = repairPaidProDocumentTitleOpening(text);
  const scan = titleRepair.repairs.length > 0 ? titleRepair.text : text;
  for (const line of scan.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (isAuthoritativePaidProAgreementDocumentTitleLine(trimmed)) {
      return trimmed.replace(/\s+/g, " ").trim().toUpperCase();
    }
  }
  return null;
}

/**
 * Atomically replace malformed multi-party opening before Section 1.
 */
export function repairPaidProMultiPartyAgreementOpening(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
  intakeText?: string | null,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  if (records.length < 3) return { text, repairs };

  let body = (text || "").replace(/\r\n/g, "\n").trim();
  const titleRepair = repairPaidProDocumentTitleOpening(body);
  if (titleRepair.repairs.length > 0) {
    body = titleRepair.text;
    repairs.push(...titleRepair.repairs);
  }
  const adjacent = repairAdjacentDuplicatePartyNamesInOpening(body, records);
  body = adjacent.text;
  repairs.push(...adjacent.repairs);

  if (!detectPaidProMalformedMultiPartyOpening(body, records)) {
    return { text: body, repairs };
  }

  const legalNames = new Set(records.map((r) => r.fullLegalName.trim().toLowerCase()).filter(Boolean));
  const stripped = stripLeadingStandalonePartyLines(body, legalNames);
  if (stripped.stripped > 0) {
    body = stripped.text;
    repairs.push("opening:strip_naked_party_header");
  }

  const { operative, executionTail } = splitOperativeAndExecutionTail(body);
  const sec1Idx = findOpeningSectionOneIndex(operative);
  const preservedPrefix = extractPreservedOperativePrefixBeforeSectionOne(operative, sec1Idx);
  const operativeRemainder = sec1Idx >= 0 ? operative.slice(sec1Idx).trim() : operative;
  const remainderBody = preservedPrefix
    ? `${preservedPrefix}\n\n${operativeRemainder}`.replace(/\n{3,}/g, "\n\n").trim()
    : operativeRemainder;
  const remainder = executionTail
    ? `${remainderBody}\n\n${executionTail}`.replace(/\n{3,}/g, "\n\n").trim()
    : remainderBody;
  const preservedTitle = readCorpusDocumentTitleUpper(body);
  const opening = buildCanonicalPaidProMultiPartyOpeningRecital(records, intakeText, preservedTitle);
  repairs.push("opening:prepend_canonical_multiparty_recital");
  if (preservedPrefix) repairs.push("opening:preserve_pre_section_one_operative_blocks");
  return { text: `${opening}${remainder}`, repairs };
}

export function ensurePaidProMultiPartyAgreementOpening(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
  intakeText?: string | null,
): { text: string; repairs: string[] } {
  if (records.length < 3) return { text, repairs: [] };
  if (!detectPaidProMalformedMultiPartyOpening(text, records)) {
    return { text, repairs: [] };
  }
  return repairPaidProMultiPartyAgreementOpening(text, records, intakeText);
}

/**
 * True when the corpus needs a full title/recital rewrite (missing title / naked party / §1-first).
 * Already-titled server drafts with minor recital gaps must not full-rewrite — that churn
 * interacts with notice/heading authorities and can reject freeze as section_heading_title_anomaly.
 */
export function needsPaidProServicesOpeningTitleRepair(text: string): boolean {
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return true;
  const first = meaningfulLines(body, 1)[0] ?? "";
  if (/^\d+\.\s/.test(first)) return true;
  if (/^This Agreement is between/i.test(first)) return true;
  const sec1Idx = findOpeningSectionOneIndex(body);
  const preSec1 = sec1Idx >= 0 ? body.slice(0, sec1Idx) : body.slice(0, 2_500);
  if (!PAID_PRO_CANONICAL_TITLE_RE.test(preSec1)) return true;
  const titleLine = meaningfulLines(preSec1, 1)[0] ?? "";
  if (!PAID_PRO_CANONICAL_TITLE_RE.test(titleLine) && !/AGREEMENT\s*$/i.test(titleLine)) {
    return true;
  }
  return false;
}

export function ensurePaidProServicesAgreementOpening(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
  intakeText?: string | null,
): { text: string; repairs: string[] } {
  if (records.length < 2) {
    return { text, repairs: [] };
  }
  const titleFirst = repairPaidProDocumentTitleOpening(text);
  let working = titleFirst.repairs.length > 0 ? titleFirst.text : text;
  const repairs = [...titleFirst.repairs];
  if (records.length >= 3) {
    const multi = ensurePaidProMultiPartyAgreementOpening(working, records, intakeText);
    return { text: multi.text, repairs: [...repairs, ...multi.repairs] };
  }
  if (!detectPaidProMalformedServicesOpening(working, records)) {
    return { text: working, repairs };
  }
  // Preserve already-titled Pro corpora unless the canonical entered-into recital is absent.
  // Title-only short-circuit previously left "is between" openers frozen as SoT.
  const head = working.slice(0, 4_000);
  const hasCanonicalEnteredInto =
    /entered\s+into\s+as\s+of\s+the\s+Effective\s+Date\s+by\s+and\s+between/i.test(head);
  if (!needsPaidProServicesOpeningTitleRepair(working) && hasCanonicalEnteredInto) {
    return { text: working, repairs };
  }
  const repaired = repairPaidProServicesAgreementOpening(working, records, intakeText);
  if (import.meta.env?.DEV && import.meta.env?.MODE !== "test" && repaired.repairs.length > 0) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-opening-recital-guard]", {
      repairs: repaired.repairs,
      lenBefore: working.length,
      lenAfter: repaired.text.length,
    });
  }
  return { text: repaired.text, repairs: [...repairs, ...repaired.repairs] };
}
