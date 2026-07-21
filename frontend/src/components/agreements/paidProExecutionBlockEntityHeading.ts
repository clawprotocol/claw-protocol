/**
 * Execution-block entity headings must carry legal entity names only — never signer
 * name/title/authority prose. Signer metadata belongs in Name/Title/Email/Address fields.
 */

import { signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  signerMetadataAuthorityHasHydratableFields,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import type { AuthoritativeSigningSnapshotRecipientMetadata } from "./authoritativeSigningSnapshot";
import { partyLegalNamesMatch } from "./paidProSignerMetadataAuthority";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasTrailingJurisdictionClausePollution,
  stripTrailingJurisdictionClause,
} from "./signerPartyLegalEntityDisplaySanitizer";
import {
  isInvalidPartySlotLegalEntity,
  isStandaloneLegalEntitySuffix,
  stripInternalPartyAliasParentheticals,
} from "./partySlotIdentityNormalize";

const PARTY_ROLE_HEADING_RE =
  /^(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*(.*)$/i;
const SIG_FIELD_RE =
  /^(?:By|Name|Title|Date|Email\s+for\s+Notices?|Address\s+for\s+Notices?)\s*:/i;

const ENTITY_SUFFIX_TAIL_RE =
  /^(.+?\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\.?)/i;
const ENTITY_MARKER_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

export const EXECUTION_HEADING_METADATA_LEAK_MARKERS: readonly RegExp[] = [
  /with\s+Sarah\s+Mitchell/i,
  /with\s+Michael\s+Torres/i,
  /signing\s+on\s+(?:its\s+)?behalf/i,
  /signing\s+on\s+behalf/i,
  /,\s*with\s+[A-Z][a-z]+\s+[A-Z][a-z]+,\s*(?:CEO|President|CFO|COO|CTO)/i,
];

export type ExecutionBlockDisplayIntegrityAudit = {
  executionHeadingMetadataLeak: boolean;
  signerFieldHydrationFailure: boolean;
  blankSignerLinesRemaining: number;
  executionBlockCount: number;
  leakMarkers: string[];
  invariantOk: boolean;
};

function executionPartyLabelNeedsAuthorityRepair(
  label: string,
  authorityName: string,
): boolean {
  const inline = (label || "").replace(/\s+/g, " ").trim();
  const authority = (authorityName || "").replace(/\s+/g, " ").trim();
  if (!inline || !authority) return false;
  if (hasTrailingJurisdictionClausePollution(inline)) return true;
  if (EXECUTION_HEADING_METADATA_LEAK_MARKERS.some((re) => re.test(inline))) return true;
  if (/\bparty[_\s-]?[ab]\b/i.test(inline)) return true;
  if (isStandaloneLegalEntitySuffix(inline) || isInvalidPartySlotLegalEntity(inline)) return true;
  if (/\band\b/i.test(inline) && !partyLegalNamesMatch(inline, authority)) return true;
  if (
    authority.length > inline.length &&
    authority.toLowerCase().startsWith(`${inline.toLowerCase()} `)
  ) {
    return true;
  }
  const stripped = stripTrailingJurisdictionClause(stripInternalPartyAliasParentheticals(inline));
  return partyLegalNamesMatch(stripped, authority) && !partyLegalNamesMatch(inline, authority);
}

function resolveExecutionBlockPartyIndex(
  roleLabel: string,
  partyHeadingCounter: number,
): number {
  const role = roleLabel.trim().toUpperCase();
  if (role === "CLIENT") return 0;
  if (role.includes("ANALYTICS") && role.includes("PROVIDER")) return 2;
  if (role.includes("SERVICE") && role.includes("PROVIDER")) return 1;
  return partyHeadingCounter;
}

export function detectExecutionHeadingMetadataLeak(text: string): {
  leak: boolean;
  markers: string[];
} {
  const body = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? body.slice(witnessIdx) : body.slice(Math.floor(body.length * 0.72));
  const markers: string[] = [];
  for (const re of EXECUTION_HEADING_METADATA_LEAK_MARKERS) {
    if (re.test(tail)) markers.push(re.source);
  }
  const lines = tail.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || SIG_FIELD_RE.test(trimmed)) continue;
    if (/^(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*$/i.test(trimmed)) continue;
    if (PARTY_ROLE_HEADING_RE.test(trimmed)) {
      const inline = trimmed.replace(/^[^:]+:\s*/, "").trim();
      if (inline && EXECUTION_HEADING_METADATA_LEAK_MARKERS.some((re) => re.test(inline))) {
        markers.push("inline_role_heading_leak");
      } else if (inline && hasTrailingJurisdictionClausePollution(inline)) {
        markers.push("inline_jurisdiction_clause_pollution");
      }
      continue;
    }
    if (ENTITY_SUFFIX_TAIL_RE.test(trimmed)) {
      const dupEntity =
        (trimmed.match(/\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited)\b/gi) || []).length >=
          2 && /\band\b/i.test(trimmed);
      if (dupEntity) markers.push("duplicated_party_entity_line");
      if (EXECUTION_HEADING_METADATA_LEAK_MARKERS.some((re) => re.test(trimmed))) {
        markers.push("entity_line_metadata_leak");
      }
      if (hasTrailingJurisdictionClausePollution(trimmed)) {
        markers.push("entity_line_jurisdiction_clause_pollution");
      }
    }
  }
  return { leak: markers.length > 0, markers: [...new Set(markers)] };
}

export function extractCleanLegalEntityFromExecutionLine(
  line: string,
  knownLegalNames: readonly string[],
): string {
  let trimmed = (line || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";

  if (hasTrailingJurisdictionClausePollution(trimmed)) {
    trimmed = stripTrailingJurisdictionClause(trimmed);
  }

  if (EXECUTION_HEADING_METADATA_LEAK_MARKERS.some((re) => re.test(trimmed))) {
    const entityOnly = trimmed.match(
      /^(.+?\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\.?)(?:,|\s+with\b|\s+and\b)/i,
    );
    if (entityOnly?.[1]) trimmed = entityOnly[1].trim();
  }

  const withIdx = trimmed.search(/,\s*with\b/i);
  if (withIdx > 0) trimmed = trimmed.slice(0, withIdx).trim();

  const signingIdx = trimmed.search(/\b(?:and\s+)?signing\s+on\s+(?:its\s+)?behalf\b/i);
  if (signingIdx > 0) trimmed = trimmed.slice(0, signingIdx).trim().replace(/,\s*$/, "");

  const andDup = trimmed.match(
    /^(.+?\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\.?)\s+and\b/i,
  );
  if (andDup) trimmed = andDup[1].trim();

  for (const legal of knownLegalNames) {
    const clean = legal.trim();
    if (!clean) continue;
    if (partyLegalNamesMatch(trimmed, clean)) return clean;
  }

  const m = trimmed.match(ENTITY_SUFFIX_TAIL_RE);
  return m ? m[1].trim() : trimmed;
}

/** Strip signer metadata from party entity lines under CLIENT / SERVICE PROVIDER headings. */
export function repairExecutionBlockEntityHeadingLines(
  corpus: string,
  parties?: readonly PaidProSignerMetadataParty[],
): { text: string; repairs: string[] } {
  const raw = (corpus || "").replace(/\r\n/g, "\n");
  const witnessIdx = raw.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text: raw, repairs: [] };

  const legalNames = (parties ?? [])
    .map((p) => p.partyLegalName.trim())
    .filter((n) => n.length >= 2);
  const lines = raw.split("\n");
  const repairs: string[] = [];
  let witnessLineIndex = -1;
  let expectEntityLine = false;
  let partyHeadingCounter = 0;
  let activePartyIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();
    if (witnessLineIndex < 0 && /\bIN WITNESS WHEREOF\b/i.test(trimmed)) {
      witnessLineIndex = i;
      expectEntityLine = false;
      continue;
    }
    if (witnessLineIndex < 0 || i <= witnessLineIndex) continue;

    const inlineHeading = trimmed.match(PARTY_ROLE_HEADING_RE);
    if (inlineHeading) {
      const role = trimmed.replace(/:.*/, "").trim();
      const inline = (inlineHeading[1] ?? "").trim();
      const partyIdx = resolveExecutionBlockPartyIndex(role, partyHeadingCounter);
      if (/^PARTY(?:\s+\d+)?$/i.test(role.trim())) partyHeadingCounter += 1;
      activePartyIndex = partyIdx;
      const authorityName = (parties ?? [])[partyIdx]?.partyLegalName?.trim() ?? "";
      if (inline) {
        const inlineLeak = EXECUTION_HEADING_METADATA_LEAK_MARKERS.some((re) => re.test(inline));
        const jurisdictionPollution = hasTrailingJurisdictionClausePollution(inline);
        const needsAuthorityRepair =
          authorityName && executionPartyLabelNeedsAuthorityRepair(inline, authorityName);
        if (inlineLeak) {
          const indent = lines[i].match(/^\s*/)?.[0] ?? "";
          lines[i] = `${indent}${role}:`;
          const cleaned = authorityName || extractCleanLegalEntityFromExecutionLine(inline, legalNames);
          lines.splice(i + 1, 0, `${indent}${cleaned}`);
          repairs.push("execution:split_inline_role_heading");
          expectEntityLine = false;
          i += 1;
        } else if (jurisdictionPollution || needsAuthorityRepair) {
          const indent = lines[i].match(/^\s*/)?.[0] ?? "";
          const cleaned =
            authorityName || extractCleanLegalEntityFromExecutionLine(inline, legalNames);
          lines[i] = `${indent}${role}: ${cleaned}`;
          repairs.push("execution:repair_inline_party_label_pollution");
          expectEntityLine = false;
        } else {
          expectEntityLine = false;
        }
      } else {
        expectEntityLine = true;
      }
      continue;
    }

    if (/^(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*$/i.test(trimmed)) {
      const role = trimmed.replace(/:.*/, "").trim();
      activePartyIndex = resolveExecutionBlockPartyIndex(role, partyHeadingCounter);
      if (/^PARTY(?:\s+\d+)?$/i.test(role.trim())) partyHeadingCounter += 1;
      expectEntityLine = true;
      continue;
    }

    if (expectEntityLine && trimmed && !SIG_FIELD_RE.test(trimmed)) {
      const authorityName = (parties ?? [])[activePartyIndex]?.partyLegalName?.trim() ?? "";
      const cleaned =
        authorityName && !partyLegalNamesMatch(trimmed, authorityName)
          ? authorityName
          : extractCleanLegalEntityFromExecutionLine(trimmed, legalNames);
      if (cleaned && cleaned !== trimmed) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        lines[i] = `${indent}${cleaned}`;
        repairs.push("execution:strip_entity_heading_metadata_leak");
      }
      expectEntityLine = false;
      continue;
    }

    if (SIG_FIELD_RE.test(trimmed) || /^by\s*:/i.test(trimmed)) {
      expectEntityLine = false;
    }
  }

  return { text: lines.join("\n"), repairs: [...new Set(repairs)] };
}

/** Remove duplicate legal-entity heading lines within each execution party block. */
export function stripDuplicateConsecutiveExecutionEntityLines(corpus: string): {
  text: string;
  repairs: string[];
} {
  const raw = (corpus || "").replace(/\r\n/g, "\n");
  const witnessIdx = raw.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text: raw, repairs: [] };

  const lines = raw.split("\n");
  const witnessLineIdx = raw.slice(0, witnessIdx).split("\n").length - 1;
  const repairs: string[] = [];

  const isEntityLine = (trimmed: string): boolean => {
    if (!trimmed || SIG_FIELD_RE.test(trimmed) || /^by\s*:/i.test(trimmed)) return false;
    if (PARTY_ROLE_HEADING_RE.test(trimmed)) return false;
    const bare = trimmed.replace(/:$/, "").trim();
    return ENTITY_SUFFIX_TAIL_RE.test(bare) || (ENTITY_MARKER_RE.test(bare) && bare.length >= 4 && bare.length <= 140);
  };

  const isPartyBlockStart = (trimmed: string): boolean =>
    /^(?:CLIENT|SERVICE\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*$/i.test(trimmed) ||
    (trimmed.endsWith(":") && isEntityLine(trimmed));

  for (let i = witnessLineIdx + 1; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (!isPartyBlockStart(trimmed) && !isEntityLine(trimmed)) continue;

    const seenEntities: string[] = [];
    let j = isPartyBlockStart(trimmed) ? i + 1 : i;
    while (j < lines.length) {
      const lineTrimmed = (lines[j] ?? "").trim();
      if (!lineTrimmed) {
        j += 1;
        continue;
      }
      if (/^by\s*:/i.test(lineTrimmed) || SIG_FIELD_RE.test(lineTrimmed)) break;
      if (/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:/i.test(lineTrimmed)) break;
      if (!isEntityLine(lineTrimmed)) break;
      const entity = lineTrimmed.replace(/:$/, "").trim();
      const duplicate = seenEntities.some((seen) => partyLegalNamesMatch(seen, entity));
      if (duplicate) {
        lines.splice(j, 1);
        repairs.push("execution:strip_duplicate_party_entity_line");
        continue;
      }
      seenEntities.push(entity);
      j += 1;
    }
    if (isPartyBlockStart(trimmed)) {
      i = j - 1;
    }
  }

  return { text: lines.join("\n"), repairs: [...new Set(repairs)] };
}

export function auditExecutionBlockDisplayIntegrity(args: {
  text: string;
  signerMetadata?: AuthoritativeSigningSnapshotRecipientMetadata | null;
  parties?: readonly PaidProSignerMetadataParty[];
}): ExecutionBlockDisplayIntegrityAudit {
  const text = (args.text || "").trim();
  const leak = detectExecutionHeadingMetadataLeak(text);
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(text, args.parties);
  const executionBlockCount = countPaidProExecutionBlocks(text);
  const metadataComplete = args.signerMetadata
    ? signerMetadataAuthorityHasHydratableFields(args.signerMetadata)
    : Boolean((args.parties ?? []).length >= 2);
  const signerFieldHydrationFailure =
    metadataComplete && blankSignerLinesRemaining > 0 && executionBlockCount === 1;
  const executionHeadingMetadataLeak = leak.leak;
  const invariantOk =
    !executionHeadingMetadataLeak &&
    !signerFieldHydrationFailure &&
    executionBlockCount === 1;
  return {
    executionHeadingMetadataLeak,
    signerFieldHydrationFailure,
    blankSignerLinesRemaining,
    executionBlockCount,
    leakMarkers: leak.markers,
    invariantOk,
  };
}

let lastIntegrityLogKey = "";

export function logExecutionBlockDisplayIntegrity(
  event: string,
  audit: ExecutionBlockDisplayIntegrityAudit & Record<string, unknown>,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify({ event, ...audit });
  if (key === lastIntegrityLogKey) return;
  lastIntegrityLogKey = key;
  // eslint-disable-next-line no-console
  console.info(event, audit);
}

export function corpusHasHydratedSignerExecutionFields(text: string): boolean {
  const body = (text || "").replace(/\r\n/g, "\n");
  const marker = signaturePatchStartIndex(body);
  if (marker < 0) return false;
  const tail = body.slice(marker);
  const names = (tail.match(/^name\s*:\s*(?!_{4,}\s*$)(?!\s*$).+/gim) || []).length;
  return names >= 2 && countBlankSignerMetadataLinesInExecutionBlock(body) === 0;
}
