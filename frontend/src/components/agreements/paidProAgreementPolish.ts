/**
 * Universal post-generation polish for paid Pro agreement bodies:
 * opening recital, signature headings, and enterprise clause defaults.
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { maskProtectedSpans, unmaskProtectedSpans } from "./paidProEmailMask";
import {
  isDisallowedPartyPhrase,
  resolveAuthoritativePartiesForRecitalPolish,
} from "./paidProPartyNamePreserve";
import { repairFullAgreementPartyIdentity } from "./canonicalPartyIdentityResolver";
import { resolvePaidProPolishPartyNamesFromIdentities } from "./guidedDealCompletion/signerPartyIdentity";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import {
  applyProOperationalSynthesisPasses,
  applyMilestoneTableGeneration,
  applySectionPurityPass,
  buildProOperationalSynthesis,
} from "./proOperationalSynthesis";
import { softenProDocumentTone } from "./premiumSituationIntelligence";
import { shouldSkipPaidProPolish } from "./agreementDocumentSurfacePolicy";
import { shouldBlockPaidProStructuralMutationAfterAcceptance } from "./paidProAuthoritativeRenderGate";
import { logPaidProPostFreezeMutationAttempt } from "./paidProFreezeDiagnostics";
import { shouldLogPaidProPolishDiagnostic } from "./paidProDiagnosticLogPolicy";
import { tracePaidProQaPassWithText } from "./paidProQaPerfTrace";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|Co\.?|Company|DAO|Foundation|Trust)\.?$/i;

const CORP_GENERIC_SECOND =
  /^(?:systems|data|automation|analytics|solutions|technologies|group|partners|grid|holdings|services|international|global|automation|software)$/i;

const RECITAL_SCAN_LEN = 5_000;

const RECITAL_OPENER_RES: readonly RegExp[] = [
  /\bentered\s+into\s+(?:(?:by\s+and\s+)?)(among|between)\s+/i,
  /\bThis\s+[\s\S]{0,200}?\s+is\s+(?:by\s+and\s+)?(among|between)\s+/i,
  /\b(?:CONFIDENTIALITY|COMMERCIAL|MASTER|SERVICES|MUTUAL|NON-?DISCLOSURE)[^\n]{0,120}\n+This\s+[\s\S]{0,120}?\s+is\s+(?:by\s+and\s+)?(among|between)\s+/i,
  /\bAgreement\s+is\s+(?:by\s+and\s+)?(among|between)\s+/i,
  /\bis\s+(?:by\s+and\s+)?(among|between)\s+(?=[A-Z][a-z])/i,
  /\bis\s+between\s+(?=[A-Z][a-z])/i,
];
const SIG_REGION_RE = /\b(?:IN WITNESS WHEREOF|SIGNATURES?|EXECUTION)\b/i;

const SOFTWARE_SCOPE_RE =
  /\b(?:software|saas|saa[sS]|hosted|cloud|platform|api|infrastructure|monitoring|uptime|maintenance|support\s+(?:services|obligations)|service\s+level|systems?\s+availability)\b/i;
const WEAK_SLA_RE =
  /\bcommercially\s+reasonable\s+(?:efforts?\s+)?(?:to\s+)?(?:maintain|achieve|provide|ensure)|best\s+efforts?\s+(?:to\s+)?maintain\s+availability/i;
const UPTIME_TARGET_RE = /\b99\.[59]\s*%|target\s+monthly\s+uptime/i;

export type PartyEntry = { full: string; short: string };

export type PartyExtractionConfidence = "high" | "low";

export type RecitalPolishLog = {
  applied: boolean;
  partyCount: number;
  confidence: PartyExtractionConfidence;
  reason: string;
};

export type SignaturePolishLog = {
  replacedCount: number;
};

export type EnterprisePolishLog = {
  effectiveDateAdded: boolean;
  disputeWindowAdded: boolean;
  uptimeTargetAdded: boolean;
  survivalPolished: boolean;
  attorneysFeesAdded: boolean;
};

export type PaidProAgreementPolishLog = {
  recital: RecitalPolishLog;
  signature: SignaturePolishLog;
  enterprise: EnterprisePolishLog;
};

export type PaidProAgreementPolishResult = {
  text: string;
  log: PaidProAgreementPolishLog;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normParty(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Trade / defined short name for a full legal entity. */
export function definedShortNameFromLegalEntity(full: string): string {
  const base = full.replace(ENTITY_SUFFIX, "").trim();
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words[0] || full;
  if (words.length === 2) return words[0];
  if (!CORP_GENERIC_SECOND.test(words[1])) return `${words[0]} ${words[1]}`;
  const short = words[0];
  if (isDisallowedPartyPhrase(short)) return full.slice(0, 48);
  return short;
}

export function buildPartyEntries(fullNames: readonly string[]): PartyEntry[] {
  return fullNames.map((full) => ({
    full: full.replace(/\s+/g, " ").trim(),
    short: definedShortNameFromLegalEntity(full),
  }));
}

export function assessPartyExtractionConfidence(
  parties: readonly string[],
  intakeRaw: string | null | undefined,
  explicitPartyList: boolean,
): { confidence: PartyExtractionConfidence; reason: string } {
  if (parties.length < 2) return { confidence: "low", reason: "fewer_than_two_parties" };
  const withSuffix = parties.filter((p) => ENTITY_SUFFIX.test(p)).length;
  if (withSuffix < Math.min(2, parties.length)) {
    return { confidence: "low", reason: "missing_entity_suffixes" };
  }
  if (explicitPartyList && parties.length >= 2) {
    return { confidence: "high", reason: "explicit_party_list" };
  }
  const fromBetween = extractBetweenPartyNameList(String(intakeRaw || ""));
  if (fromBetween.length >= 2) {
    const matched = parties.filter((p) =>
      fromBetween.some((b) => normParty(b) === normParty(p) || normParty(p).includes(normParty(b))),
    ).length;
    if (matched >= 2) return { confidence: "high", reason: "between_clause_match" };
  }
  if (withSuffix === parties.length && parties.length >= 2) {
    return { confidence: "high", reason: "entity_suffix_parties" };
  }
  return { confidence: "low", reason: "weak_party_extraction" };
}

function oxfordJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function partyListFragment(parties: readonly PartyEntry[]): string {
  const labels = parties
    .filter((p) => !isDisallowedPartyPhrase(p.short) && !isDisallowedPartyPhrase(p.full))
    .map((p) => `${p.full} (“${p.short}”)`);
  return oxfordJoin(labels);
}

const DEFINED_SHORT_IN_HEAD_RE =
  /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\s*\([“"][^”"]{1,48}[”"]\)/gi;

/** Count entity (“Short”) defined-name marks in the opening slice — corruption guard. */
export function countDefinedShortMarksInHead(text: string, maxLen = 500): number {
  const slice = text.slice(0, maxLen);
  return (slice.match(DEFINED_SHORT_IN_HEAD_RE) || []).length;
}

function headCorruptionExceedsPartyBudget(head: string, authoritativePartyCount: number): boolean {
  if (authoritativePartyCount < 2) return true;
  return countDefinedShortMarksInHead(head) > authoritativePartyCount + 1;
}

function collectivePhrase(partyCount: number): string {
  if (partyCount < 2) return "";
  if (partyCount === 2) return ' (each a “Party” and together, the “Parties”)';
  return ' (each a “Party” and collectively, the “Parties”)';
}

function extractAgreementTitle(head: string): string | null {
  const titleLine = head.match(
    /^\s*((?:CONFIDENTIALITY|MASTER|SERVICES|SOFTWARE|DATA|COMMERCIAL|MUTUAL|NON-?DISCLOSURE)[^\n]{4,100})/im,
  );
  if (titleLine?.[1]) return titleLine[1].replace(/\s+/g, " ").trim();
  const thisTitle = head.match(
    /This\s+((?:[A-Z][^\n]{4,90}?)(?:\s+Agreement|\s+Contract))\s+\(the\s+["']?Agreement["']?\)/i,
  );
  if (thisTitle?.[1]) return thisTitle[1].replace(/\s+/g, " ").trim();
  return null;
}

function normalizeQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u201C\u201D"'`]/g, '"');
}

function recitalAlreadyPolished(recitalSlice: string, parties: readonly PartyEntry[]): boolean {
  const slice = normalizeQuotes(recitalSlice);
  if (!parties.every((p) => slice.includes(p.full))) return false;
  const definedMarks = parties.filter(
    (p) =>
      !isDisallowedPartyPhrase(p.short) &&
      slice.includes(`${p.full} (`) &&
      (slice.includes(`"${p.short}"`) || slice.includes(`“${p.short}”`)),
  ).length;
  if (definedMarks < parties.length) return false;
  if (headCorruptionExceedsPartyBudget(slice, parties.length)) return false;
  return true;
}

type RecitalSpan = {
  prefix: string;
  connector: "among" | "between";
  partyList: string;
  suffix: string;
  start: number;
  end: number;
};

type RecitalOpenerMatch = {
  index: number;
  partyStart: number;
  connector: "among" | "between";
};

function findRecitalOpener(head: string): RecitalOpenerMatch | null {
  const candidates: RecitalOpenerMatch[] = [];
  const pushAll = (
    re: RegExp,
    connectorFrom: (m: RegExpExecArray) => "among" | "between",
  ) => {
    const flags = re.flags.includes("g") ? re : new RegExp(re.source, `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = flags.exec(head)) !== null) {
      candidates.push({
        index: m.index,
        partyStart: m.index + m[0].length,
        connector: connectorFrom(m),
      });
    }
  };

  for (const re of RECITAL_OPENER_RES) {
    pushAll(re, (m) => ((m[1] || m[2] || "").toLowerCase() === "between" ? "between" : "among"));
  }
  pushAll(/\bis\s+between\s+(?=[A-Z])/gi, () => "between");
  pushAll(/\bby\s+and\s+between\s+(?=[A-Z])/gi, () => "between");

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0]!;
}

function findRecitalSpan(head: string): RecitalSpan | null {
  const opener = findRecitalOpener(head);
  if (!opener) return null;

  const connector = opener.connector;
  const partyStart = opener.partyStart;
  const matchIndex = opener.index;
  const thisIdx = head.lastIndexOf("This ", matchIndex);
  const lineStart = head.lastIndexOf("\n", matchIndex) + 1;
  const start = thisIdx >= 0 && matchIndex - thisIdx < 280 ? thisIdx : lineStart;
  const prefix = head.slice(start, partyStart);

  const rest = head.slice(partyStart);
  let partyListEnd = -1;
  let suffix = ".";

  const hardStop = rest.search(
    /\n\s*1\.\s+[A-Z]|\.\s+The\s+Parties\s+agree\b|\.\s*\n\s*(?:WHEREAS|NOW,?\s*THEREFORE|ARTICLE\s+1\b|Section\s+1\b)/i,
  );
  const structuredEnd = rest.match(
    /^([\s\S]+?)(\.\s*(?:(?:\n\s*(?:WHEREAS|NOW,?\s*THEREFORE|ARTICLE|TERM\b|\d+\.\s+[A-Z]))|(?:\(?\s*each\s+a\s+["'“”]?Party|collectively|Each\s+Party))|;\s)/i,
  );
  if (structuredEnd) {
    partyListEnd = structuredEnd[1].length;
    suffix = structuredEnd[2];
  } else {
    const plainDot = rest.indexOf(".");
    if (plainDot < 0) return null;
    partyListEnd = plainDot;
    suffix = rest.slice(plainDot, plainDot + 1);
  }
  if (hardStop >= 0 && hardStop < partyListEnd) {
    partyListEnd = hardStop;
    suffix = rest.slice(hardStop).match(/^\./) ? "." : ".";
  }
  if (partyListEnd > 900) {
    const plainDot = rest.indexOf(".");
    if (plainDot < 0) return null;
    partyListEnd = Math.min(plainDot, hardStop >= 0 ? hardStop : plainDot);
    suffix = rest.slice(partyListEnd, partyListEnd + 1) || ".";
  }

  const partyList = rest.slice(0, partyListEnd).trim();
  const end = partyStart + partyListEnd + suffix.length;
  return { prefix, connector, partyList, suffix, start, end };
}

function buildRecitalReplacement(
  existingPrefix: string,
  parties: readonly PartyEntry[],
  connector: "among" | "between",
  title: string | null,
): string {
  const joiner = connector === "between" ? "by and between" : "by and among";
  const list = partyListFragment(parties);
  const collective = collectivePhrase(parties.length);

  if (/^\s*This\s+/i.test(existingPrefix) || title) {
    const agreementTitle = title || "Agreement";
    return `This ${agreementTitle} (the “Agreement”) is entered into ${joiner} ${list}${collective}`;
  }
  if (/entered\s+into/i.test(existingPrefix)) {
    return `${existingPrefix.replace(/\s+$/i, "")} ${list}${collective}`;
  }
  return `This Agreement is entered into ${joiner} ${list}${collective}`;
}

function normalizedLegalNamePresent(head: string, legalName: string): boolean {
  const base = legalName.replace(/[.,]+$/g, "").trim().toLowerCase();
  return head.toLowerCase().includes(base);
}

/** True when frozen 3+ party manifest is not fully represented in the opening recital. */
export function frozenManifestRecitalNeedsRewrite(text: string, names: readonly string[]): boolean {
  if (names.length < 3) return false;
  const head = text.slice(0, Math.min(text.length, RECITAL_SCAN_LEN));
  if (names.some((n) => !normalizedLegalNamePresent(head, n))) return true;
  if (/\(\s*["']Service Provider["']\s*\)/i.test(head)) return true;
  return false;
}

export function normalizeOpeningRecital(
  text: string,
  parties: readonly PartyEntry[],
  confidence: PartyExtractionConfidence,
  opts?: { skipInternalMask?: boolean; forceRewrite?: boolean },
): { text: string; log: RecitalPolishLog } {
  const authoritativeCount = parties.length;
  const baseLog: RecitalPolishLog = {
    applied: false,
    partyCount: authoritativeCount,
    confidence,
    reason: "not_applied",
  };
  if (confidence === "low" || authoritativeCount < 2) {
    return { text, log: { ...baseLog, reason: "low_confidence" } };
  }

  const headLen = Math.min(text.length, RECITAL_SCAN_LEN);
  const headSlice = text.slice(0, headLen);
  const maskedPack = opts?.skipInternalMask
    ? { text: headSlice, emails: [] as string[], urls: [] as string[] }
    : maskProtectedSpans(headSlice);
  const maskedHead = maskedPack.text;
  const emails = maskedPack.emails;
  const urls = maskedPack.urls;
  const recital = findRecitalSpan(maskedHead);

  if (!recital) {
    return {
      text,
      log: { ...baseLog, reason: "recital_not_found" },
    };
  }

  if (
    !opts?.forceRewrite &&
    (recitalAlreadyPolished(recital.partyList, parties) ||
      recitalAlreadyPolished(maskedHead, parties))
  ) {
    return {
      text,
      log: { ...baseLog, reason: "already_polished" },
    };
  }

  const needsShortRewrite = parties.some(
    (p) =>
      new RegExp(`(?<![\\w/])${escapeRe(p.short)}(?![\\w@])`, "i").test(recital.partyList) &&
      !recital.partyList.includes(p.full),
  );
  if (
    !opts?.forceRewrite &&
    !needsShortRewrite &&
    parties.every((p) => recital.partyList.includes(p.full))
  ) {
    return {
      text,
      log: { ...baseLog, reason: "already_full_names" },
    };
  }

  const title = extractAgreementTitle(maskedHead.slice(0, recital.start + 40));
  const preferredConnector =
    parties.length === 2 ? "between" : ("among" as const);
  const replacement = buildRecitalReplacement(
    recital.prefix,
    parties,
    preferredConnector,
    title,
  );
  const newHead =
    maskedHead.slice(0, recital.start) + replacement + recital.suffix + maskedHead.slice(recital.end);
  const unmaskedHead = opts?.skipInternalMask ? newHead : unmaskProtectedSpans(newHead, emails, urls);
  if (headCorruptionExceedsPartyBudget(unmaskedHead, authoritativeCount)) {
    return {
      text,
      log: { ...baseLog, reason: "corruption_guard" },
    };
  }
  const tail = text.slice(headLen);
  return {
    text: unmaskedHead + tail,
    log: { ...baseLog, applied: true, partyCount: authoritativeCount, reason: "rewrote_recital" },
  };
}

function isSignatureHeadingLine(line: string, parties: readonly PartyEntry[]): PartyEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (/^(by|name|title|date|email|address|phone|fax|signature|initials?)\s*:/i.test(trimmed)) {
    return null;
  }
  if (/@|https?:\/\//i.test(trimmed)) return null;
  if (ENTITY_SUFFIX.test(trimmed)) return null;
  const t = normParty(trimmed);
  const matches = parties.filter((p) => {
    const s = normParty(p.short);
    const f = normParty(p.full);
    if (t === s || t === f) return true;
    if (s.startsWith(`${t} `) || s.startsWith(t)) return true;
    const first = s.split(/\s+/)[0];
    return first === t;
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => b.full.length - a.full.length)[0] ?? null;
}

export function normalizeSignatureBlockHeadings(
  text: string,
  parties: readonly PartyEntry[],
  opts?: { skipInternalMask?: boolean },
): { text: string; log: SignaturePolishLog } {
  const marker = text.search(SIG_REGION_RE);
  if (marker < 0 || parties.length < 2) {
    return { text, log: { replacedCount: 0 } };
  }

  const before = text.slice(0, marker);
  const sigRegion = text.slice(marker);
  const maskedPack = opts?.skipInternalMask
    ? { text: sigRegion, emails: [] as string[], urls: [] as string[] }
    : maskProtectedSpans(sigRegion);
  const masked = maskedPack.text;
  const emails = maskedPack.emails;
  const urls = maskedPack.urls;

  const lines = masked.split("\n");
  let replacedCount = 0;
  const outLines = lines.map((line, idx) => {
    const hit = isSignatureHeadingLine(line, parties);
    if (!hit) return line;
    const next = lines[idx + 1]?.trim() ?? "";
    const next2 = lines[idx + 2]?.trim() ?? "";
    const looksLikeSignatureBlock =
      /^(by|name|title|date|email|signature|initials?)\s*:/i.test(next) ||
      (!next && /^(by|name|title|date|email|signature|initials?)\s*:/i.test(next2));
    if (!looksLikeSignatureBlock) return line;
    replacedCount += 1;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return `${indent}${hit.full}`;
  });

  let polishedSig = opts?.skipInternalMask
    ? outLines.join("\n")
    : unmaskProtectedSpans(outLines.join("\n"), emails, urls);
  for (const p of [...parties].sort((a, b) => b.short.length - a.short.length)) {
    polishedSig = polishedSig.replace(
      new RegExp(`^(\\s*)${escapeRe(p.short)}(\\s*)$`, "gim"),
      `$1${p.full}$2`,
    );
  }
  return { text: before + polishedSig, log: { replacedCount } };
}

function polishEffectiveDate(text: string): { text: string; added: boolean } {
  const definesEffective =
    /\(the\s+["'“”]Effective Date["'“”]\)/i.test(text) ||
    /["'“”]Effective Date["'“”]\s+means/i.test(text) ||
    /becomes\s+effective\s+on\s+the\s+date\s+of\s+the\s+last\s+signature/i.test(text);
  if (definesEffective) return { text, added: false };

  const inlineUpgrade = text.replace(
    /\b(begins|commences|starts)\s+on\s+the\s+effective\s+date\s+of\s+the\s+last\s+signature\b/gi,
    "begins on the date of the last signature below (the “Effective Date”)",
  );
  if (inlineUpgrade !== text) {
    return { text: inlineUpgrade, added: true };
  }

  const referencesEffective =
    /\beffective\s+date\b/i.test(text) ||
    /\bdate\s+of\s+(?:the\s+)?last\s+signature\b/i.test(text) ||
    /\blast\s+signature\s+below\b/i.test(text);
  if (!referencesEffective) return { text, added: false };

  const clause =
    'The initial term of this Agreement begins on the date of the last signature below (the “Effective Date”).';
  if (text.includes(clause)) return { text, added: false };

  const termAnchor = text.search(/\b(?:^|\n)\s*(?:\d+\.\s*)?(?:term|duration)\b/im);
  if (termAnchor >= 0) {
    const lineStart = text.lastIndexOf("\n", termAnchor) + 1;
    return {
      text: text.slice(0, lineStart) + clause + "\n\n" + text.slice(lineStart),
      added: true,
    };
  }

  const witness = text.search(SIG_REGION_RE);
  if (witness > 120) {
    return {
      text: text.slice(0, witness).trimEnd() + "\n\n" + clause + "\n\n" + text.slice(witness),
      added: true,
    };
  }

  return { text: text.trimEnd() + "\n\n" + clause, added: true };
}

function polishDisputeEscalationWindow(text: string): { text: string; added: boolean } {
  const anchor = text.search(/\b(?:disputes?|mediation|arbitration|escalation)\b/i);
  if (anchor < 0) return { text, added: false };

  const block = text.slice(anchor, anchor + 1200);
  if (
    /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|sixty|ninety)\s*\(\s*\d+\s*\)\s*(?:business\s+)?days?\b/i.test(
      block,
    ) ||
    /\b\d+\s+(?:business\s+)?days?\s+(?:of\s+)?(?:negotiation|mediation|notice)\b/i.test(block) ||
    /\bat\s+least\s+(?:fifteen|15)\s*\(\s*15\s*\)\s+business\s+days?\b/i.test(block)
  ) {
    return { text, added: false };
  }
  if (!/\b(?:negotiat|escalat|mediat|litigat|court|arbitrat)/i.test(block)) {
    return { text, added: false };
  }

  const insert =
    " The parties will engage in good faith negotiations for at least fifteen (15) business days before commencing litigation, arbitration, or other formal proceedings.";
  if (text.includes(insert.trim())) return { text, added: false };

  const lineEnd = text.indexOf("\n", anchor);
  const at = lineEnd > anchor ? lineEnd : text.indexOf(".", anchor) + 1;
  if (at <= 0) return { text, added: false };
  return { text: text.slice(0, at) + insert + text.slice(at), added: true };
}

function polishServiceUptimeTarget(text: string): { text: string; added: boolean } {
  if (!SOFTWARE_SCOPE_RE.test(text)) return { text, added: false };
  if (UPTIME_TARGET_RE.test(text)) return { text, added: false };
  const weak = text.match(WEAK_SLA_RE);
  if (!weak || weak.index === undefined) return { text, added: false };

  const addition =
    ", with a target monthly uptime availability of 99.5%, excluding scheduled maintenance, emergency maintenance, force majeure events, third-party failures outside a party’s reasonable control, and acts or omissions of other parties";
  if (text.includes("target monthly uptime availability of 99.5%")) {
    return { text, added: false };
  }

  const idx = weak.index + weak[0].length;
  return { text: text.slice(0, idx) + addition + text.slice(idx), added: true };
}

function polishSurvivalClause(text: string): { text: string; added: boolean } {
  const implied =
    /\bsurvive\s+(?:termination|expiration|expiry)\b/i.test(text) ||
    /\bby\s+(?:their\s+)?nature\b[^.\n]{0,80}\bsurvive\b/i.test(text) ||
    /\bprovisions?\s+that\b[^.\n]{0,80}\bsurvive\b/i.test(text);
  const explicitTopics =
    /\bprovisions?\s+concerning\s+payment\s+obligations\s+accrued\s+before\s+termination\b/i.test(text) ||
    /\bconfidentiality,\s*intellectual\s+property,\s*data\s+rights\b/i.test(text);
  const explicitSurvivalList =
    /\bconfidentiality\b/i.test(text) &&
    /\bintellectual\s+property\b/i.test(text) &&
    /\bindemnification\b/i.test(text) &&
    /\bsurvive\s+(?:termination|expiration|expiry)\b/i.test(text);
  if (!implied || explicitTopics || explicitSurvivalList) return { text, added: false };

  const sentence =
    " The provisions concerning payment obligations accrued before termination, confidentiality, intellectual property, data rights and use restrictions, indemnification, limitation of liability, dispute resolution, governing law, audit rights, non-solicitation/non-circumvention, and miscellaneous provisions survive expiration or termination.";
  if (text.includes(sentence.trim())) return { text, added: false };

  const termAnchor = text.search(/\b(?:^|\n)\s*(?:\d+\.\s*)?TERMINATION\b/im);
  if (termAnchor >= 0) {
    const lineEnd = text.indexOf("\n", termAnchor);
    const at = lineEnd > termAnchor ? lineEnd : text.indexOf(".", termAnchor) + 1;
    if (at > 0) return { text: text.slice(0, at) + sentence + text.slice(at), added: true };
  }

  return { text: text.trimEnd() + sentence, added: true };
}

function polishAttorneysFees(text: string): { text: string; added: boolean } {
  if (
    /\battorneys[''\u2019]?\s+fees\b/i.test(text) ||
    /\bprevailing\s+party\b/i.test(text)
  ) {
    return { text, added: false };
  }
  if (!/\b(?:dispute|arbitration|litigation|governing\s+law|jurisdiction|venue)\b/i.test(text)) {
    return { text, added: false };
  }

  const clause =
    " The prevailing Party in any action or proceeding arising out of or relating to this Agreement is entitled to recover its reasonable attorneys’ fees and costs to the extent permitted by applicable law.";
  if (text.includes(clause.trim())) return { text, added: false };

  const anchor = text.search(/\b(?:dispute|governing\s+law|jurisdiction|arbitration)\b/i);
  if (anchor < 0) return { text: text.trimEnd() + clause, added: true };
  const paraEnd = text.indexOf("\n\n", anchor);
  const at = paraEnd > anchor ? paraEnd : text.indexOf(".", anchor) + 1;
  if (at <= 0) return { text: text.trimEnd() + clause, added: true };
  return { text: text.slice(0, at) + clause + text.slice(at), added: true };
}

export function applyEnterpriseClausePolish(text: string): { text: string; log: EnterprisePolishLog } {
  let working = text;
  const effective = polishEffectiveDate(working);
  working = effective.text;
  const dispute = polishDisputeEscalationWindow(working);
  working = dispute.text;
  const uptime = polishServiceUptimeTarget(working);
  working = uptime.text;
  const survival = polishSurvivalClause(working);
  working = survival.text;
  const fees = polishAttorneysFees(working);
  working = fees.text;

  return {
    text: working,
    log: {
      effectiveDateAdded: effective.added,
      disputeWindowAdded: dispute.added,
      uptimeTargetAdded: uptime.added,
      survivalPolished: survival.added,
      attorneysFeesAdded: fees.added,
    },
  };
}

export function logPaidProRecitalPolish(payload: RecitalPolishLog & { surface?: string }): void {
  if (import.meta.env.MODE === "test") return;
  if (
    !shouldLogPaidProPolishDiagnostic({ applied: payload.applied })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[paid-pro-recital-polish]", payload);
}

export function logPaidProSignaturePolish(payload: SignaturePolishLog & { surface?: string }): void {
  if (import.meta.env.MODE === "test") return;
  if (!shouldLogPaidProPolishDiagnostic({ replacedCount: payload.replacedCount })) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signature-polish]", payload);
}

export function logPaidProEnterprisePolish(payload: EnterprisePolishLog & { surface?: string }): void {
  if (import.meta.env.MODE === "test") return;
  if (
    !shouldLogPaidProPolishDiagnostic({
      effectiveDateAdded: payload.effectiveDateAdded,
      disputeWindowAdded: payload.disputeWindowAdded,
      uptimeTargetAdded: payload.uptimeTargetAdded,
      survivalPolished: payload.survivalPolished,
      attorneysFeesAdded: payload.attorneysFeesAdded,
    })
  ) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[paid-pro-enterprise-polish]", payload);
}

/**
 * Universal paid-Pro agreement polish (after contact email substitution).
 * Email/URL-safe; deterministic; no full-body logging.
 */
export function polishPaidProAgreementText(
  text: string,
  intakeRaw: string | null | undefined,
  partyNames: readonly string[] | null | undefined,
  opts?: {
    surface?: string;
    explicitPartyList?: boolean;
    skipInternalMask?: boolean;
    /** Guided signer setup identities override intake-only entity extraction. */
    signerPartyIdentities?: readonly CanonicalPartyIdentity[];
  },
): PaidProAgreementPolishResult {
  if (shouldSkipPaidProPolish({ surface: opts?.surface })) {
    if (shouldBlockPaidProStructuralMutationAfterAcceptance(opts?.surface)) {
      logPaidProPostFreezeMutationAttempt({
        caller: "polishPaidProAgreementText",
        blocked: true,
        surface: opts?.surface ?? null,
      });
    }
    return {
      text: text || "",
      log: {
        recital: { applied: false, partyCount: 0, confidence: "high", reason: "starter_surface_blocked" },
        signature: { replacedCount: 0 },
        enterprise: {
          effectiveDateAdded: false,
          disputeWindowAdded: false,
          uptimeTargetAdded: false,
          survivalPolished: false,
          attorneysFeesAdded: false,
        },
      },
    };
  }
  const explicitPartyList = opts?.explicitPartyList ?? (partyNames?.length ?? 0) >= 2;
  const fromSigner = resolvePaidProPolishPartyNamesFromIdentities(opts?.signerPartyIdentities ?? []);
  const authoritativeFullNames =
    fromSigner.length >= 2
      ? fromSigner
      : resolveAuthoritativePartiesForRecitalPolish(partyNames, intakeRaw);
  const parties = buildPartyEntries(authoritativeFullNames);
  const { confidence: assessed } = assessPartyExtractionConfidence(
    authoritativeFullNames,
    intakeRaw,
    explicitPartyList,
  );
  const confidence =
    authoritativeFullNames.length < 2
      ? ("low" as const)
      : assessed;

  const surface = opts?.surface ?? "unknown";
  const recital = tracePaidProQaPassWithText("paid-pro-recital-polish", surface, text, () =>
    normalizeOpeningRecital(text, parties, confidence, {
      skipInternalMask: opts?.skipInternalMask,
    }),
  );
  let working = recital.text;
  const signature = tracePaidProQaPassWithText("paid-pro-signature-polish", `${surface}:initial`, working, () =>
    normalizeSignatureBlockHeadings(working, parties, {
      skipInternalMask: opts?.skipInternalMask,
    }),
  );
  working = signature.text;
  const synthesis = buildProOperationalSynthesis(intakeRaw || "", {
    parties: parties.map((p) => ({ name: p.full, role: "" })),
    title: "",
    jurisdiction: "",
    purpose: "",
    payment_terms: "",
    payment: { amount: null, cadence: null, valid: false },
    duration: null,
    due_date: null,
    effective_date: null,
  });
  const operational = applyProOperationalSynthesisPasses(working, intakeRaw || "", synthesis, {
    paymentTerms: intakeRaw || "",
  });
  working = operational.text;

  const enterprise = tracePaidProQaPassWithText("paid-pro-enterprise-polish", surface, working, () =>
    applyEnterpriseClausePolish(working),
  );
  working = enterprise.text;

  const signatureFinal = tracePaidProQaPassWithText("paid-pro-signature-polish", `${surface}:final`, working, () =>
    normalizeSignatureBlockHeadings(working, parties, {
      skipInternalMask: opts?.skipInternalMask,
    }),
  );
  working = signatureFinal.text;

  const purityFinal = applySectionPurityPass(working);
  working = purityFinal.text;

  const milestoneFinal = applyMilestoneTableGeneration(
    working,
    intakeRaw || "",
    intakeRaw || "",
    synthesis.responsibilities,
  );
  working = milestoneFinal.text;
  working = softenProDocumentTone(working);

  const partyIdentity = repairFullAgreementPartyIdentity({
    text: working,
    intakeRaw,
    partyNames: authoritativeFullNames,
    signerIdentities: opts?.signerPartyIdentities,
  });
  working = partyIdentity.text;

  const log: PaidProAgreementPolishLog = {
    recital: recital.log,
    signature: {
      replacedCount: signature.log.replacedCount + signatureFinal.log.replacedCount,
    },
    enterprise: enterprise.log,
  };

  logPaidProRecitalPolish({ surface: opts?.surface, ...log.recital });
  logPaidProSignaturePolish({ surface: opts?.surface, ...log.signature });
  logPaidProEnterprisePolish({ surface: opts?.surface, ...log.enterprise });

  return { text: working, log };
}
