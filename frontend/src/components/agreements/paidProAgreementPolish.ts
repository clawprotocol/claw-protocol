/**
 * Universal post-generation polish for paid Pro agreement bodies:
 * opening recital, signature headings, and enterprise clause defaults.
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { maskProtectedSpans, unmaskProtectedSpans } from "./paidProEmailMask";
import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|Co\.?|Company|DAO|Foundation|Trust)\.?$/i;

const CORP_GENERIC_SECOND =
  /^(?:systems|data|automation|analytics|solutions|technologies|group|partners|grid|holdings|services|international|global|automation|software)$/i;

const RECITAL_SCAN_LEN = 3_200;
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
  return words[0];
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
  const labels = parties.map((p) => `${p.full} (“${p.short}”)`);
  return oxfordJoin(labels);
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
    (p) => slice.includes(`${p.full} (`) && slice.includes(`"${p.short}"`),
  ).length;
  return definedMarks >= parties.length;
}

type RecitalSpan = {
  prefix: string;
  connector: "among" | "between";
  partyList: string;
  suffix: string;
  start: number;
  end: number;
};

function findRecitalSpan(head: string): RecitalSpan | null {
  const m = head.match(/\bentered\s+into\s+(?:(by\s+and\s+)?)(among|between)\s+/i);
  if (!m || m.index === undefined) return null;

  const connector = (m[2] || "among").toLowerCase() === "between" ? "between" : "among";
  const partyStart = m.index + m[0].length;
  const thisIdx = head.lastIndexOf("This ", m.index);
  const lineStart = head.lastIndexOf("\n", m.index) + 1;
  const start = thisIdx >= 0 && m.index - thisIdx < 240 ? thisIdx : lineStart;
  const prefix = head.slice(start, partyStart);

  const rest = head.slice(partyStart);
  let partyListEnd = -1;
  let suffix = ".";
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
  if (partyListEnd > 900) {
    const plainDot = rest.indexOf(".");
    if (plainDot < 0) return null;
    partyListEnd = plainDot;
    suffix = rest.slice(plainDot, plainDot + 1);
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

export function normalizeOpeningRecital(
  text: string,
  parties: readonly PartyEntry[],
  confidence: PartyExtractionConfidence,
): { text: string; log: RecitalPolishLog } {
  const baseLog: RecitalPolishLog = {
    applied: false,
    partyCount: parties.length,
    confidence,
    reason: "not_applied",
  };
  if (confidence === "low" || parties.length < 2) {
    return { text, log: { ...baseLog, reason: "low_confidence" } };
  }

  const headLen = Math.min(text.length, RECITAL_SCAN_LEN);
  const { text: maskedHead, emails, urls } = maskProtectedSpans(text.slice(0, headLen));
  const recital = findRecitalSpan(maskedHead);

  if (!recital) {
    return {
      text,
      log: { ...baseLog, reason: "recital_not_found" },
    };
  }

  if (
    recitalAlreadyPolished(recital.partyList, parties) ||
    recitalAlreadyPolished(maskedHead, parties)
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
  if (!needsShortRewrite && parties.every((p) => recital.partyList.includes(p.full))) {
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
  const unmaskedHead = unmaskProtectedSpans(newHead, emails, urls);
  const tail = text.slice(headLen);
  return {
    text: unmaskedHead + tail,
    log: { ...baseLog, applied: true, reason: "rewrote_recital" },
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
  const hit = parties.find((p) => normParty(trimmed) === normParty(p.short));
  return hit ?? null;
}

export function normalizeSignatureBlockHeadings(
  text: string,
  parties: readonly PartyEntry[],
): { text: string; log: SignaturePolishLog } {
  const marker = text.search(SIG_REGION_RE);
  if (marker < 0 || parties.length < 2) {
    return { text, log: { replacedCount: 0 } };
  }

  const before = text.slice(0, marker);
  const sigRegion = text.slice(marker);
  const { text: masked, emails, urls } = maskProtectedSpans(sigRegion);

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

  const polishedSig = unmaskProtectedSpans(outLines.join("\n"), emails, urls);
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
  // eslint-disable-next-line no-console
  console.info("[paid-pro-recital-polish]", payload);
}

export function logPaidProSignaturePolish(payload: SignaturePolishLog & { surface?: string }): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signature-polish]", payload);
}

export function logPaidProEnterprisePolish(payload: EnterprisePolishLog & { surface?: string }): void {
  if (import.meta.env.MODE === "test") return;
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
  opts?: { surface?: string; explicitPartyList?: boolean },
): PaidProAgreementPolishResult {
  const explicitPartyList = opts?.explicitPartyList ?? (partyNames?.length ?? 0) >= 2;
  const fullNames = resolveFullLegalPartiesFromIntake(partyNames, intakeRaw);
  const parties = buildPartyEntries(fullNames);
  const { confidence } = assessPartyExtractionConfidence(
    fullNames,
    intakeRaw,
    explicitPartyList,
  );

  const recital = normalizeOpeningRecital(text, parties, confidence);
  let working = recital.text;
  const signature = normalizeSignatureBlockHeadings(working, parties);
  working = signature.text;
  const enterprise = applyEnterpriseClausePolish(working);
  working = enterprise.text;

  const log: PaidProAgreementPolishLog = {
    recital: recital.log,
    signature: signature.log,
    enterprise: enterprise.log,
  };

  logPaidProRecitalPolish({ surface: opts?.surface, ...log.recital });
  logPaidProSignaturePolish({ surface: opts?.surface, ...log.signature });
  logPaidProEnterprisePolish({ surface: opts?.surface, ...log.enterprise });

  return { text: working, log };
}
