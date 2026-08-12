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
import {
  logExecutionBlockDisplayIntegrity,
  repairExecutionBlockEntityHeadingLines,
  auditExecutionBlockDisplayIntegrity,
} from "./paidProExecutionBlockEntityHeading";
import { applyContactAuthorityExecutionBlockIntegrity } from "./contactAuthorityExecutionBlockIntegrity";

const PARTY_SECTION_HEADING_RE =
  /^(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*(.*)$/i;

const SIG_FIELD_RE =
  /^(By|Name|Title|Date|Email(?:\s+for\s+Notices?)?|Address(?:\s+for\s+Notices?)?)\s*:\s*(.*)$/i;

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
    if (role === "SERVICE PROVIDER") {
      const idx = identities.findIndex((id) => id.blockHeading === "SERVICE PROVIDER");
      if (idx >= 0) return { party: parties[idx]!, identity: identities[idx]! };
    }
    if (role === "ANALYTICS PROVIDER") {
      const idx = identities.findIndex((id) => id.blockHeading === "ANALYTICS PROVIDER");
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
  opts?: { overwriteExistingMetadata?: boolean },
): { line: string; hydrated: number; missing: string[] } {
  const trimmed = line.trim();
  const m = trimmed.match(SIG_FIELD_RE);
  if (!m) return { line, hydrated: 0, missing: [] };

  const field = m[1] ?? "";
  const value = m[2] ?? "";
  const signName = signatureNameForIdentity(identity);
  const missing: string[] = [];
  const overwrite = opts?.overwriteExistingMetadata === true;

  if (/^by$/i.test(field) || /^date$/i.test(field)) {
    return { line, hydrated: 0, missing };
  }
  if (/^name$/i.test(field)) {
    if (signName && (overwrite || isBlankSigValue(value))) {
      const next = fillSigFieldLine(line, "Name", signName);
      if (next.trim() === trimmed) return { line, hydrated: 0, missing };
      return { line: next, hydrated: 1, missing };
    }
    if (!signName && isBlankSigValue(value)) missing.push(`name:${party.partyIndex}`);
    return { line, hydrated: 0, missing };
  }
  if (/^title$/i.test(field)) {
    const title = identity.title?.trim() ?? "";
    if (title && (overwrite || isBlankSigValue(value))) {
      const next = fillSigFieldLine(line, "Title", title);
      if (next.trim() === trimmed) return { line, hydrated: 0, missing };
      return { line: next, hydrated: 1, missing };
    }
    if (!title && isBlankSigValue(value)) missing.push(`title:${party.partyIndex}`);
    return { line, hydrated: 0, missing };
  }
  if (/^email$/i.test(field)) {
    const email = (party.signerEmail || identity.email || "").trim();
    if (email && (overwrite || isBlankSigValue(value))) {
      const next = fillSigFieldLine(line, "Email", email);
      if (next.trim() === trimmed) return { line, hydrated: 0, missing };
      return { line: next, hydrated: 1, missing };
    }
    return { line, hydrated: 0, missing };
  }
  if (/^email\s+for\s+notice/i.test(field) || /^address\s+for\s+notice/i.test(field)) {
    // Strip legacy "Email/Address for Notice" labels; bare Email: is filled above / inserted below.
    return { line: "", hydrated: 0, missing: [] };
  }
  return { line, hydrated: 0, missing };
}

export type HydratePaidProExecutionBlockOpts = {
  /** When true (finalize), replace populated Name/Title/Email/Address with latest authority. */
  overwriteExistingMetadata?: boolean;
  /** Frozen server_full SoT — skip heading/contact structural repairs that mutate operative text. */
  frozenCorpusImmutable?: boolean;
};

export function hydratePaidProExecutionBlockWithSignerMetadata(
  corpus: string,
  recipientMetadata: AuthoritativeSigningSnapshotRecipientMetadata,
  roleContext?: PaidProPartyRoleContext | null,
  opts?: HydratePaidProExecutionBlockOpts,
): HydratePaidProExecutionBlockResult {
  const raw = (corpus || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return { corpus: raw, applied: false, fieldsHydrated: 0, missingFields: ["empty_corpus"] };
  }

  const parties = recipientMetadataToAuthorityParties(recipientMetadata);
  if (parties.length < 2) {
    return { corpus: raw, applied: false, fieldsHydrated: 0, missingFields: ["insufficient_parties"] };
  }

  const immutable = opts?.frozenCorpusImmutable === true;
  const repairedHeadings = immutable
    ? { text: raw, repairs: [] as string[] }
    : repairExecutionBlockEntityHeadingLines(raw, parties);
  let working = repairedHeadings.text;

  const witnessIdx = working.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) {
    return { corpus: working, applied: false, fieldsHydrated: 0, missingFields: ["missing_witness"] };
  }

  const execInvariant = analyzePaidProExecutionBlockInvariant(working, { expectedParties: parties.length });
  if (execInvariant.witnessClauseCount !== 1) {
    return {
      corpus: working,
      applied: false,
      fieldsHydrated: 0,
      missingFields: [`witness_count:${execInvariant.witnessClauseCount}`],
    };
  }

  const context: PaidProPartyRoleContext = {
    ...roleContext,
    acceptedCorpus: roleContext?.acceptedCorpus ?? working,
  };
  const identities = authorityPartiesToCanonicalPartyIdentities(parties, context);

  const marker = signaturePatchStartIndex(working);
  const lines = working.split("\n");
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
    if (PARTY_SECTION_HEADING_RE.test(trimmed)) {
      currentParty = partyFromLine;
    } else if (partyFromLine) {
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
      const hydrated = hydrateFieldLine(lines[i], currentParty.party, currentParty.identity, opts);
      if (!hydrated.line.trim()) {
        lines.splice(i, 1);
        i -= 1;
        fieldsHydrated += hydrated.hydrated;
        missingFields.push(...hydrated.missing);
        offset += 0;
        continue;
      }
      if (hydrated.hydrated > 0) {
        lines[i] = hydrated.line;
        fieldsHydrated += hydrated.hydrated;
      }
      missingFields.push(...hydrated.missing);

      // After Title, insert bare Email:/Address: when authority has contact and the block lacks them.
      if (/^title\s*:/i.test(lines[i]!.trim()) && currentParty) {
        const email = (currentParty.party.signerEmail || currentParty.identity.email || "").trim();
        const address = (
          currentParty.party.partyAddress ||
          currentParty.identity.partyAddress ||
          ""
        ).trim();
        const lookAhead = [lines[i + 1], lines[i + 2], lines[i + 3]]
          .map((l) => (l ?? "").trim())
          .filter(Boolean);
        const hasEmailSoon = lookAhead.some((l) => /^email\s*:/i.test(l));
        const hasAddressSoon = lookAhead.some((l) => /^address\s*:/i.test(l));
        const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
        if (email && !hasEmailSoon) {
          lines.splice(i + 1, 0, `${indent}Email: ${email}`);
          fieldsHydrated += 1;
          i += 1;
        }
        if (address && !hasAddressSoon) {
          const insertAt = /^email\s*:/i.test((lines[i + 1] ?? "").trim()) ? i + 2 : i + 1;
          lines.splice(insertAt, 0, `${indent}Address: ${address}`);
          fieldsHydrated += 1;
          i = insertAt;
        }
      }
    }

    offset += lines[i].length + 1;
  }

  const normalized = immutable
    ? lines.join("\n")
    : applyContactAuthorityExecutionBlockIntegrity(lines.join("\n"), {
        source: "hydrate_paid_pro_execution_block",
        ensureNoticesClause: false,
      }).text;
  const integrity = auditExecutionBlockDisplayIntegrity({
    text: normalized,
    signerMetadata: recipientMetadata,
    parties,
  });
  if (!integrity.invariantOk) {
    logExecutionBlockDisplayIntegrity("[paid-pro-execution-block-integrity]", {
      ...integrity,
      reason: integrity.executionHeadingMetadataLeak
        ? "EXECUTION_HEADING_METADATA_LEAK"
        : integrity.signerFieldHydrationFailure
          ? "SIGNER_FIELD_HYDRATION_FAILURE"
          : "execution_block_integrity",
      repairs: repairedHeadings.repairs,
      fieldsHydrated,
    });
  }
  return {
    corpus: normalized,
    applied: fieldsHydrated > 0 || repairedHeadings.repairs.length > 0,
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

/** Count blank required signer metadata lines (Name/Title/Email when authority supplies values). */
export function countBlankSignerMetadataLinesInExecutionBlock(
  corpus: string,
  parties?: readonly PaidProSignerMetadataParty[],
): number {
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return 0;
  const tail = corpus.slice(witnessIdx);
  const lines = tail.split("\n");
  let count = 0;
  let partyIndex = -1;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY)/i.test(trimmed) && /:/.test(trimmed)) {
      partyIndex += 1;
      continue;
    }
    const party = parties?.[partyIndex];
    if (/^name\s*:/i.test(trimmed) && party?.signerName.trim()) {
      if (/^name\s*:\s*(?:_{2,}\s*)?$/i.test(trimmed)) count += 1;
      continue;
    }
    if (/^title\s*:/i.test(trimmed) && party?.signerTitle.trim()) {
      if (/^title\s*:\s*(?:_{2,}\s*)?$/i.test(trimmed)) count += 1;
    }
  }

  if (parties?.length) return count;

  let legacy = 0;
  if (BLANK_SIG_NAME_RE.test(tail)) legacy += (tail.match(BLANK_SIG_NAME_RE) || []).length;
  if (BLANK_SIG_TITLE_RE.test(tail)) legacy += (tail.match(BLANK_SIG_TITLE_RE) || []).length;
  return legacy;
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
