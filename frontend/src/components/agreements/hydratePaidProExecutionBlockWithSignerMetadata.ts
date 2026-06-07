/**
 * Deterministic execution-block hydration for paid Pro signer finalize.
 * Replaces Name/Title/Email/Address placeholders inside the existing single execution
 * block — never rewrites operative clauses or appends a second witness block.
 */

import type { AuthoritativeSigningSnapshotRecipientMetadata } from "./authoritativeSigningSnapshot";
import { signaturePatchStartIndex } from "./guidedDealCompletion/signatureRegion";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  authorityPartiesToCanonicalPartyIdentities,
  recipientMetadataToAuthorityParties,
  type PaidProPartyRoleContext,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import {
  signatureNameForIdentity,
  type CanonicalPartyIdentity,
} from "./guidedDealCompletion/signerPartyIdentity";

const PARTY_SECTION_HEADING_RE =
  /^(?:CLIENT|SERVICE\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*(.*)$/i;

const SIG_FIELD_RE =
  /^(By|Name|Title|Date|Email\s+for\s+Notices?|Address\s+for\s+Notices?)\s*:\s*(.*)$/i;

const ENTITY_SUFFIX_LINE_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

export type HydratePaidProExecutionBlockResult = {
  corpus: string;
  applied: boolean;
  fieldsHydrated: number;
  missingFields: string[];
};

function isBlankSigValue(value: string): boolean {
  const v = value.trim();
  return !v || /^_{2,}$/.test(v);
}

function fillSigFieldLine(line: string, label: string, value: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  return `${indent}${label}: ${value}`;
}

function resolvePartyFromLine(
  trimmed: string,
  parties: readonly PaidProSignerMetadataParty[],
  identities: readonly CanonicalPartyIdentity[],
): { party: PaidProSignerMetadataParty; identity: CanonicalPartyIdentity } | null {
  const heading = trimmed.match(PARTY_SECTION_HEADING_RE);
  if (heading) {
    const inlineName = (heading[1] ?? "").trim();
    if (inlineName) {
      const partyIdx = parties.findIndex((p) => partyLegalNamesMatch(inlineName, p.partyLegalName));
      if (partyIdx >= 0) {
        return { party: parties[partyIdx]!, identity: identities[partyIdx]! };
      }
    }
    const role = trimmed.replace(/:.*/, "").trim().toUpperCase();
    if (role === "CLIENT") {
      const idx = identities.findIndex((id) => id.blockHeading === "CLIENT");
      if (idx >= 0) return { party: parties[idx]!, identity: identities[idx]! };
    }
    if (role.includes("SERVICE") && role.includes("PROVIDER")) {
      const idx = identities.findIndex((id) => id.blockHeading === "SERVICE PROVIDER");
      if (idx >= 0) return { party: parties[idx]!, identity: identities[idx]! };
    }
    return null;
  }
  if (SIG_FIELD_RE.test(trimmed)) return null;
  for (let i = 0; i < parties.length; i++) {
    const p = parties[i]!;
    const id = identities[i]!;
    if (p.partyLegalName && partyLegalNamesMatch(trimmed, id.partyDisplayName)) {
      return { party: p, identity: id };
    }
  }
  return null;
}

function isPartySectionStart(trimmed: string, parties: readonly PaidProSignerMetadataParty[]): boolean {
  if (PARTY_SECTION_HEADING_RE.test(trimmed)) return true;
  if (SIG_FIELD_RE.test(trimmed)) return false;
  if (!ENTITY_SUFFIX_LINE_RE.test(trimmed)) return false;
  return parties.some((p) => partyLegalNamesMatch(trimmed, p.partyLegalName));
}

function hydrateFieldLine(
  line: string,
  party: PaidProSignerMetadataParty,
  identity: CanonicalPartyIdentity,
): { line: string; hydrated: number; missing: string[] } {
  const trimmed = line.trim();
  const m = trimmed.match(SIG_FIELD_RE);
  if (!m) return { line, hydrated: 0, missing: [] };

  const field = m[1] ?? "";
  const value = m[2] ?? "";
  const signName = signatureNameForIdentity(identity);
  const missing: string[] = [];

  if (/^by$/i.test(field) || /^date$/i.test(field)) {
    return { line, hydrated: 0, missing };
  }
  if (/^name$/i.test(field)) {
    if (signName && isBlankSigValue(value)) {
      return { line: fillSigFieldLine(line, "Name", signName), hydrated: 1, missing };
    }
    if (!signName && isBlankSigValue(value)) missing.push(`name:${party.partyIndex}`);
    return { line, hydrated: 0, missing };
  }
  if (/^title$/i.test(field)) {
    const title = identity.title?.trim() ?? "";
    if (title && isBlankSigValue(value)) {
      return { line: fillSigFieldLine(line, "Title", title), hydrated: 1, missing };
    }
    if (!title && isBlankSigValue(value)) missing.push(`title:${party.partyIndex}`);
    return { line, hydrated: 0, missing };
  }
  if (/^email\s+for\s+notice/i.test(field)) {
    const email = identity.email?.trim() ?? "";
    const label = /^email\s+for\s+notices\s*:/i.test(trimmed) ? "Email for Notices" : "Email for Notice";
    if (email && isBlankSigValue(value)) {
      return { line: fillSigFieldLine(line, label, email), hydrated: 1, missing };
    }
    if (!email && isBlankSigValue(value)) missing.push(`email:${party.partyIndex}`);
    return { line, hydrated: 0, missing };
  }
  if (/^address\s+for\s+notice/i.test(field)) {
    const address = identity.partyAddress?.trim() ?? "";
    const label = /^address\s+for\s+notices\s*:/i.test(trimmed)
      ? "Address for Notices"
      : "Address for Notice";
    if (address && isBlankSigValue(value)) {
      return { line: fillSigFieldLine(line, label, address), hydrated: 1, missing };
    }
    if (!address && isBlankSigValue(value)) missing.push(`address:${party.partyIndex}`);
    return { line, hydrated: 0, missing };
  }
  return { line, hydrated: 0, missing };
}

export function hydratePaidProExecutionBlockWithSignerMetadata(
  corpus: string,
  recipientMetadata: AuthoritativeSigningSnapshotRecipientMetadata,
  roleContext?: PaidProPartyRoleContext | null,
): HydratePaidProExecutionBlockResult {
  const raw = (corpus || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return { corpus: raw, applied: false, fieldsHydrated: 0, missingFields: ["empty_corpus"] };
  }

  const parties = recipientMetadataToAuthorityParties(recipientMetadata);
  if (parties.length < 2) {
    return { corpus: raw, applied: false, fieldsHydrated: 0, missingFields: ["insufficient_parties"] };
  }

  const witnessIdx = raw.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) {
    return { corpus: raw, applied: false, fieldsHydrated: 0, missingFields: ["missing_witness"] };
  }

  const execInvariant = analyzePaidProExecutionBlockInvariant(raw, { expectedParties: parties.length });
  if (execInvariant.witnessClauseCount !== 1) {
    return {
      corpus: raw,
      applied: false,
      fieldsHydrated: 0,
      missingFields: [`witness_count:${execInvariant.witnessClauseCount}`],
    };
  }

  const context: PaidProPartyRoleContext = {
    ...roleContext,
    acceptedCorpus: roleContext?.acceptedCorpus ?? raw,
  };
  const identities = authorityPartiesToCanonicalPartyIdentities(parties, context);

  const marker = signaturePatchStartIndex(raw);
  const lines = raw.split("\n");
  let offset = 0;
  let fieldsHydrated = 0;
  const missingFields: string[] = [];
  let currentParty: { party: PaidProSignerMetadataParty; identity: CanonicalPartyIdentity } | null =
    null;
  let byCountAfterMarker = 0;

  for (let i = 0; i < lines.length; i++) {
    if (offset < marker && offset < witnessIdx) {
      offset += lines[i].length + 1;
      continue;
    }
    const trimmed = lines[i].trim();
    if (!trimmed) {
      offset += lines[i].length + 1;
      continue;
    }

    const partyFromLine = resolvePartyFromLine(trimmed, parties, identities);
    if (partyFromLine) {
      currentParty = partyFromLine;
    } else if (isPartySectionStart(trimmed, parties)) {
      const resolved = resolvePartyFromLine(trimmed, parties, identities);
      if (resolved) currentParty = resolved;
    }

    if (/^by\s*:/i.test(trimmed) && offset >= marker) {
      if (byCountAfterMarker >= 0 && !currentParty) {
        const idx = Math.min(byCountAfterMarker, parties.length - 1);
        currentParty = { party: parties[idx]!, identity: identities[idx]! };
      }
      byCountAfterMarker += 1;
    }

    if (currentParty && SIG_FIELD_RE.test(trimmed)) {
      const hydrated = hydrateFieldLine(lines[i], currentParty.party, currentParty.identity);
      if (hydrated.hydrated > 0) {
        lines[i] = hydrated.line;
        fieldsHydrated += hydrated.hydrated;
      }
      missingFields.push(...hydrated.missing);
    }

    offset += lines[i].length + 1;
  }

  const normalized = lines.join("\n");
  return {
    corpus: normalized,
    applied: fieldsHydrated > 0,
    fieldsHydrated,
    missingFields,
  };
}

let lastHydrationAppliedLog = "";
let lastHydrationMissingLog = "";

export function logPaidProSignerMetadataHydrationApplied(payload: {
  surface: string;
  fieldsHydrated: number;
  rawLen: number;
  hydratedLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  const key = `${payload.surface}:${payload.fieldsHydrated}:${payload.hydratedLen}`;
  if (key === lastHydrationAppliedLog) return;
  lastHydrationAppliedLog = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-metadata-hydration-applied]", payload);
}

export function logPaidProSignerMetadataHydrationMissing(payload: {
  surface: string;
  missingFields: readonly string[];
  rawLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  if (!payload.missingFields.length) return;
  const key = `${payload.surface}:${payload.missingFields.join(",")}`;
  if (key === lastHydrationMissingLog) return;
  lastHydrationMissingLog = key;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-signer-metadata-hydration-missing]", payload);
}

const BLANK_SIG_NAME_RE = /^name\s*:\s*(?:_{2,}\s*)?$/im;
const BLANK_SIG_TITLE_RE = /^title\s*:\s*(?:_{2,}\s*)?$/im;
const BLANK_SIG_EMAIL_RE = /^email\s+for\s+notices?\s*:\s*(?:_{2,}\s*)?$/im;
const BLANK_SIG_ADDRESS_RE = /^address\s+for\s+notices?\s*:\s*(?:_{2,}\s*)?$/im;

/** Count blank Name/Title/Email/Address lines remaining in the execution tail. */
export function countBlankSignerMetadataLinesInExecutionBlock(corpus: string): number {
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return 0;
  const tail = corpus.slice(witnessIdx);
  let count = 0;
  if (BLANK_SIG_NAME_RE.test(tail)) count += (tail.match(BLANK_SIG_NAME_RE) || []).length;
  if (BLANK_SIG_TITLE_RE.test(tail)) count += (tail.match(BLANK_SIG_TITLE_RE) || []).length;
  if (BLANK_SIG_EMAIL_RE.test(tail)) count += (tail.match(BLANK_SIG_EMAIL_RE) || []).length;
  if (BLANK_SIG_ADDRESS_RE.test(tail)) count += (tail.match(BLANK_SIG_ADDRESS_RE) || []).length;
  return count;
}

export function signerMetadataAuthorityHasHydratableFields(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): boolean {
  const parties = recipientMetadataToAuthorityParties(meta);
  return parties.some(
    (p) => p.signerName.trim() || p.signerTitle.trim() || p.signerEmail.trim() || p.partyAddress.trim(),
  );
}

export function logPaidProSignerFinalizeParity(payload: {
  surface: string;
  rawLen: number;
  hydratedLen: number;
  lenDelta: number;
  invariantOk: boolean;
  executionBlockCount: number;
  witnessCount: number;
  canonicalHash?: string | null;
  finalizedHash?: string | null;
  signerFieldOnlyDelta?: boolean;
  signerHydrationApplied?: boolean;
  blankSignerLinesRemaining?: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-finalize-parity]", payload);
}

export function logPaidProReviewActionsVisible(payload: {
  copyVisible: boolean;
  editVisible: boolean;
  exportVisible?: boolean;
  prepareVisible?: boolean;
  surface: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-actions-visible]", payload);
}
