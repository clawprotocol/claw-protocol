/**
 * Paid Pro services agreement opening guard — ensures title + recital precede Section 1.
 * Runs at corpus acceptance (before SoT, review, copy, export, signer setup).
 */

import {
  PARTY_ENTITY_SUFFIX_RE,
  type CanonicalPartyIdentityRecord,
} from "./canonicalPartyIdentityResolver";

export const PAID_PRO_MUTUAL_CONSULTING_TITLE = "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT";

const RECITAL_LINE_RE =
  /^(?:This\s+)?(?:Mutual\s+)?(?:Consulting|Services|Professional)[\s\S]{0,220}?(?:Agreement|Contract)\b/i;

export function buildCanonicalPaidProServicesOpeningRecital(
  client: CanonicalPartyIdentityRecord,
  provider: CanonicalPartyIdentityRecord,
): string {
  const clientName = client.fullLegalName.trim();
  const providerName = provider.fullLegalName.trim();
  return [
    PAID_PRO_MUTUAL_CONSULTING_TITLE,
    "",
    `This Mutual Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date by and between ${clientName} ("Client") and ${providerName} ("Service Provider"). Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties."`,
    "",
  ].join("\n");
}

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

function openingSliceBeforeSection1(text: string): string {
  const match = text.replace(/\r\n/g, "\n").search(/^\s*1\.\s+/m);
  return match >= 0 ? text.slice(0, match) : text.slice(0, 2_500);
}

/** True when paid Pro services corpus lacks a valid title + recital before Section 1. */
export function detectPaidProMalformedServicesOpening(
  text: string,
  records?: readonly CanonicalPartyIdentityRecord[],
): boolean {
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (!body) return true;

  const client = records?.[0]?.fullLegalName.trim() ?? "";
  const provider = records?.[1]?.fullLegalName.trim() ?? "";
  const legalNames = new Set(
    [client, provider].filter(Boolean).map((name) => name.toLowerCase()),
  );

  const lines = meaningfulLines(body, 6);
  const first = lines[0] ?? "";
  const second = lines[1] ?? "";

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
  const sec1Idx = body.search(/^\s*1\.\s+/m);
  if (sec1Idx < 0) {
    return !/entered\s+into/i.test(body.slice(0, 2_500));
  }

  if (!/entered\s+into/i.test(preSec1)) {
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
  if (!/\(\s*["']?Service Provider["']?\s*\)/i.test(preSec1)) {
    return true;
  }
  if (/Effective\s+Date\s+This\s+Agreement\s+is\s+between/i.test(preSec1)) {
    return true;
  }
  if (!/MUTUAL\s+CONSULTING\s+AND\s+IMPLEMENTATION\s+AGREEMENT/i.test(preSec1)) {
    const trimmedPre = preSec1.trim();
    if (trimmedPre.length < 120 || isStandalonePartyEntityLine(first, legalNames)) {
      return true;
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

  if (!/MUTUAL\s+CONSULTING\s+AND\s+IMPLEMENTATION\s+AGREEMENT/i.test(head)) {
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

  const sec1Idx = body.search(/^\s*1\.\s+/m);
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

  const sec1Idx = body.search(/^\s*1\.\s+/m);
  const remainder = sec1Idx >= 0 ? body.slice(sec1Idx).trim() : body;
  const opening = buildCanonicalPaidProServicesOpeningRecital(client, provider);
  repairs.push("opening:prepend_canonical_services_recital");
  return { text: `${opening}${remainder}`, repairs };
}

export function ensurePaidProServicesAgreementOpening(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): { text: string; repairs: string[] } {
  if (records.length < 2) {
    return { text, repairs: [] };
  }
  if (!detectPaidProMalformedServicesOpening(text, records)) {
    return { text, repairs: [] };
  }
  const repaired = repairPaidProServicesAgreementOpening(text, records);
  if (import.meta.env?.DEV && import.meta.env?.MODE !== "test" && repaired.repairs.length > 0) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-opening-recital-guard]", {
      repairs: repaired.repairs,
      lenBefore: text.length,
      lenAfter: repaired.text.length,
    });
  }
  return repaired;
}
