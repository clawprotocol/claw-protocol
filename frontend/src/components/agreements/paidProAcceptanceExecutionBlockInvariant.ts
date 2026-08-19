/**
 * Pre-freeze Paid Pro acceptance invariant: exactly one canonical execution block
 * (IN WITNESS WHEREOF + party signature sections) derived from intake/manifest.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { CanonicalPartyIdentityRecord } from "./canonicalPartyIdentityResolver";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { PAID_PRO_AUTHORITY_MAX_PARTIES } from "./paidProAuthorityLimits";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";
import { manifestRecordsFromBrandLicensingProseIntake } from "./paidProBrandLicensingFreezeAuthority";
import { isGenericCanonicalRole } from "./canonicalPartyRoleAuthority";
import {
  labeledPartyBlockRoleLabel,
  labeledPartyLegalEntities,
  parseAllStructuredPartyContactBlocks,
  parseQuotedRolePartyLines,
  quotedRolePartyLegalEntities,
} from "./labeledPartyBlockParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  extractIntakePartyManifestRows,
  intakePartyManifestIsAuthoritative,
} from "./intakePartyManifestAuthority";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  dedupeEntityCandidatesToLegalParties,
  extractAgreementEntityCandidates,
} from "../../agreement/partyPlaceholderDisplay";
import {
  analyzePaidProExecutionBlockInvariant,
  assertPaidProSingleExecutionBlock,
  countPaidProExecutionBlocks,
  tailHasCollapsedInlineSignerFields,
} from "./paidProExecutionBlockAuthority";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { stripInlineStaleServerSignatureTailBeforeWitness } from "./paidProFlattenedDocumentNormalize";
import { buildSigningCapacityExecutionBlockSection } from "./contactAuthorityExecutionBlockIntegrity";

export const PAID_PRO_ACCEPTANCE_WITNESS_LINE =
  "IN WITNESS WHEREOF, the Parties execute this Agreement.";

/**
 * Paid Pro Execution Normalization Authority (acceptance / pre-freeze):
 *
 * Canonical execution block — single tail region with the authoritative witness line
 * and the correct party signature sections derived from intake/manifest authority.
 *
 * Stale execution tail — execution-related material outside that one canonical region:
 * extra SIGNATURES headings, duplicate witness clauses, incomplete By/Name/Title lines,
 * flattened legacy signature sequences, and superseded inline blocks before the canonical witness.
 *
 * Preservation boundary — only positively classified stale execution material may be removed.
 * Substantive operative clauses, notices, counterparts language in the body, and the one
 * canonical execution block must not be deleted or rewritten.
 *
 * Idempotence — normalize(normalize(doc)) === normalize(doc) for accepted corpora.
 */
const STALE_PRE_WITNESS_INLINE_SIGNATURES_RE =
  /\bSIGNATURES\b\s+(?:The\s+parties\s+have\s+caused|have\s+caused)/i;

function preWitnessRegion(text: string): string {
  const idx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? text.slice(0, idx) : text;
}

/** True when stale server-style SIGNATURES material remains before the canonical witness. */
export function hasStalePreWitnessExecutionTail(text: string): boolean {
  return STALE_PRE_WITNESS_INLINE_SIGNATURES_RE.test(preWitnessRegion(text));
}

/** Positive classification of any stale execution material before the canonical witness block. */
export function hasPreWitnessStaleExecutionMaterial(text: string): boolean {
  if (hasStalePreWitnessExecutionTail(text)) return true;
  const pre = preWitnessRegion(text);
  if (
    /\bSIGNATURES\b[\s\S]{0,400}?\n\s*By\s*:\s*\n\s*Name\s*:\s*\n\s*Title\s*:/i.test(pre)
  ) {
    return true;
  }
  const sigHeading = pre.match(/(?:^|\n)\s*SIGNATURES\b([\s\S]*)$/i);
  if (sigHeading) {
    const afterHeading = (sigHeading[1] ?? "").trim();
    if (!afterHeading) return true;
    if (/\b(?:By|Name|Title|Date)\s*:/i.test(afterHeading)) return true;
    if (/\b(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(afterHeading)) return true;
  }
  return false;
}

/** Remove stale execution-tail material while preserving the canonical witness block. */
export function removeStalePreWitnessExecutionTail(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!/\bIN WITNESS WHEREOF\b/i.test(out)) {
    return { text: out, repairs };
  }
  if (!hasPreWitnessStaleExecutionMaterial(out)) {
    return { text: out, repairs };
  }

  const stripped = stripInlineStaleServerSignatureTailBeforeWitness(out);
  if (stripped.text !== out) {
    out = stripped.text;
    repairs.push(...stripped.repairs.map((r) => `stale_execution_tail:${r}`));
  }

  if (hasStalePreWitnessExecutionTail(out)) {
    const pre = preWitnessRegion(out);
    const staleIdx = pre.search(STALE_PRE_WITNESS_INLINE_SIGNATURES_RE);
    if (staleIdx >= 0) {
      const witnessTail = out.slice(pre.length);
      out = `${pre.slice(0, staleIdx).trimEnd()}\n\n${witnessTail.trimStart()}`
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      repairs.push("stale_execution_tail:inline_signatures_truncated");
    }
  }

  return { text: out, repairs: [...new Set(repairs)] };
}

const MULTI_PARTY_SIGNATURE_LINES = [
  "By: _____________________________",
  "Name: ___________________________",
  "Title: __________________________",
  "Date: ___________________________",
] as const;

export type MultiPartyExecutionBlockShapeAudit = {
  malformed: boolean;
  reasons: string[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function acceptanceManifestRoleLabel(
  _fullLegalName: string,
  index: number,
  partyCount: number,
  explicitRole?: string,
): string {
  const explicit = (explicitRole || "").trim();
  if (explicit.length >= 2 && !isGenericCanonicalRole(explicit)) return explicit;
  if (partyCount >= 3) return `Party ${index + 1}`;
  if (index === 0) return "Client";
  if (index === 1) return "Service Provider";
  return `Party ${index + 1}`;
}

function manifestRecordsFromConsumedSignerAuthority(): CanonicalPartyIdentityRecord[] {
  const consumed = readConsumedPaidProSignerMetadataAuthority();
  if (!consumed || consumed.parties.length < 2) return [];
  const partyCount = Math.min(consumed.parties.length, PAID_PRO_AUTHORITY_MAX_PARTIES);
  const records: CanonicalPartyIdentityRecord[] = [];
  for (let index = 0; index < partyCount; index += 1) {
    const party = consumed.parties[index];
    if (!party) continue;
    const fullLegalName = String(party.partyLegalName ?? "").trim();
    if (!isAuthoritativeLegalEntityName(fullLegalName)) continue;
    records.push({
      fullLegalName,
      roleLabel: acceptanceManifestRoleLabel(fullLegalName, index, partyCount),
      displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
      signerName: String(party.signerName ?? "").trim() || null,
      signerTitle: String(party.signerTitle ?? "").trim() || null,
      partyAddress: String(party.partyAddress ?? "").trim() || null,
    });
  }
  return records.length >= 2 ? records : [];
}

function manifestRecordsFromLabeledPartyBlocks(intakeText: string): CanonicalPartyIdentityRecord[] {
  const blocks = parseAllStructuredPartyContactBlocks(intakeText);
  if (blocks.length < 2) return [];
  return blocks.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES).map((block) => {
    const fullLegalName = block.legalEntity.trim();
    return {
      fullLegalName,
      roleLabel: labeledPartyBlockRoleLabel(block, intakeText),
      displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
      signerName: block.signerName.trim() || null,
      signerTitle: block.signerTitle.trim() || null,
      partyAddress: block.address.trim() || null,
    };
  });
}

/**
 * Ordered records from the authoritative intake party manifest (colon-role / numbered / bullet
 * lists). This is the same authority the canonical metadata / signer-setup / handoff surfaces
 * already use, and it preserves party identity, order, and role labels (e.g. Client, Lead
 * Provider, Implementation Partner, Cybersecurity Auditor) — never re-derived from the model
 * corpus, so the opening recital and execution tail keep all declared parties.
 */
function manifestRecordsFromIntakePartyManifest(intakeText: string): CanonicalPartyIdentityRecord[] {
  const rows = extractIntakePartyManifestRows(intakeText);
  if (rows.length < 2) return [];
  const partyCount = Math.min(rows.length, PAID_PRO_AUTHORITY_MAX_PARTIES);
  return rows.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES).map((row, index) => {
    const fullLegalName = row.partyLegalName.trim();
    const intakeRole = row.roleLabel.trim();
    const roleLabel =
      intakeRole.length >= 2 && !isGenericCanonicalRole(intakeRole)
        ? intakeRole
        : acceptanceManifestRoleLabel(fullLegalName, index, partyCount, intakeRole);
    return {
      fullLegalName,
      roleLabel,
      displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
      signerName: null,
      signerTitle: null,
      partyAddress: row.partyAddress.trim() || null,
    };
  });
}

function manifestRecordsFromQuotedRoleLines(intakeText: string): CanonicalPartyIdentityRecord[] {
  const quoted = parseQuotedRolePartyLines(intakeText);
  if (quoted.length < 2) return [];
  const partyCount = Math.min(quoted.length, PAID_PRO_AUTHORITY_MAX_PARTIES);
  return quoted.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES).map((entry, index) => ({
    fullLegalName: entry.legalEntity.trim(),
    roleLabel: acceptanceManifestRoleLabel(entry.legalEntity, index, partyCount, entry.roleLabel),
    displayAlias: entry.legalEntity.split(/\s+/).slice(0, 2).join(" "),
    signerName: null,
    signerTitle: null,
    partyAddress: null,
  }));
}

function roleToExecutionHeading(roleLabel: string): string {
  const r = roleLabel.replace(/\s+/g, " ").trim().toLowerCase();
  if (r === "client") return "CLIENT";
  if (r.includes("service") && r.includes("provider")) return "SERVICE PROVIDER";
  if (r.includes("analytics") && r.includes("provider")) return "ANALYTICS PROVIDER";
  if (r === "buyer") return "BUYER";
  if (r === "seller") return "SELLER";
  if (r === "lender") return "LENDER";
  if (r === "borrower") return "BORROWER";
  if (r === "landlord") return "LANDLORD";
  if (r === "tenant") return "TENANT";
  if (r === "employer") return "EMPLOYER";
  if (r === "contractor") return "CONTRACTOR";
  if (r === "licensor") return "LICENSOR";
  if (r === "licensee") return "LICENSEE";
  return roleLabel.replace(/\s+/g, " ").trim().toUpperCase();
}

function sortManifestRecordsForExecution(
  records: readonly CanonicalPartyIdentityRecord[],
): CanonicalPartyIdentityRecord[] {
  if (records.length <= 2) {
    const clientIdx = records.findIndex((r) => /^client$/i.test(r.roleLabel.trim()));
    const providerIdx = records.findIndex((r) =>
      /service\s+provider|^provider$/i.test(r.roleLabel.trim()),
    );
    if (clientIdx >= 0 && providerIdx >= 0 && clientIdx !== providerIdx) {
      return [records[clientIdx]!, records[providerIdx]!];
    }
    return [...records];
  }
  const clientIdx = records.findIndex((r) => /^client$/i.test(r.roleLabel.trim()));
  const providerIdx = records.findIndex((r) =>
    /service\s+provider|^provider$/i.test(r.roleLabel.trim()),
  );
  const analyticsIdx = records.findIndex((r) => /analytics\s+provider/i.test(r.roleLabel.trim()));
  const ordered: CanonicalPartyIdentityRecord[] = [];
  if (clientIdx >= 0) ordered.push(records[clientIdx]!);
  if (providerIdx >= 0) ordered.push(records[providerIdx]!);
  if (analyticsIdx >= 0) ordered.push(records[analyticsIdx]!);
  for (let i = 0; i < records.length; i += 1) {
    if (!ordered.includes(records[i]!)) ordered.push(records[i]!);
  }
  return ordered;
}

function buildPartyExecutionSection(rec: CanonicalPartyIdentityRecord): string {
  return buildSigningCapacityExecutionBlockSection({
    heading: roleToExecutionHeading(rec.roleLabel),
    legalEntityName: rec.fullLegalName,
    signerName: rec.signerName,
    signerTitle: rec.signerTitle,
  });
}

function buildMultiPartyEntityNameExecutionSection(rec: CanonicalPartyIdentityRecord): string {
  const heading = rec.fullLegalName.trim().toUpperCase();
  return [heading, "", ...MULTI_PARTY_SIGNATURE_LINES].join("\n");
}

function buildMultiPartyEntityNameExecutionTailFromManifest(
  records: readonly CanonicalPartyIdentityRecord[],
): string {
  const blocks = records.map(buildMultiPartyEntityNameExecutionSection);
  return [PAID_PRO_ACCEPTANCE_WITNESS_LINE, "", ...blocks].join("\n\n");
}

function countProperMultiPartyEntitySignatureSections(
  tail: string,
  records: readonly CanonicalPartyIdentityRecord[],
): number {
  let count = 0;
  for (const rec of records) {
    const heading = rec.fullLegalName.trim().toUpperCase();
    if (new RegExp(`(?:^|\\n\\n)${escapeRegex(heading)}\\s*\\n\\nBy:`, "m").test(tail)) {
      count += 1;
    }
  }
  return count;
}

/** Detect collapsed / 2-party-fallback / mangled execution tails for 3+ party Pro acceptance. */
export function analyzeMultiPartyExecutionBlockShape(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): MultiPartyExecutionBlockShapeAudit {
  const reasons: string[] = [];
  if (records.length < 3) return { malformed: false, reasons };

  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text.slice(-4000);
  const witnessFirstLine = tail.split("\n")[0] ?? "";

  if (/\b(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(tail)) {
    reasons.push("two_party_role_fallback");
  }

  if (
    /\bIN WITNESS WHEREOF\b/i.test(witnessFirstLine) &&
    (/\b(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(witnessFirstLine) || /\bBy\s*:/i.test(witnessFirstLine))
  ) {
    reasons.push("inline_witness_collapsed");
  }

  if (tailHasCollapsedInlineSignerFields(tail)) {
    reasons.push("inline_signer_fields");
  }

  for (const rec of records) {
    const full = rec.fullLegalName.trim();
    const shortAlias = full.split(/\s+/).slice(0, 2).join(" ");
    const withoutSuffix = full.replace(/\s+(?:LLC|L\.L\.C\.|Inc\.?)$/i, "").trim();
    if (
      new RegExp(`${escapeRegex(full)}\\s*:\\s*${escapeRegex(shortAlias)}`, "i").test(tail) ||
      new RegExp(`${escapeRegex(full)}\\s*:\\s*${escapeRegex(withoutSuffix)}`, "i").test(tail)
    ) {
      reasons.push(`entity_name_mangled:${full}`);
    }
    if (
      /\bLLC\b/i.test(full) &&
      tail.toLowerCase().includes(withoutSuffix.toLowerCase()) &&
      !tail.toLowerCase().includes(full.toLowerCase())
    ) {
      reasons.push(`entity_truncated:${full}`);
    }
  }

  const properSections = countProperMultiPartyEntitySignatureSections(tail, records);
  if (witnessIdx >= 0 && properSections < records.length) {
    reasons.push(`entity_signature_sections:${properSections}_of_${records.length}`);
  }

  return { malformed: reasons.length > 0, reasons: [...new Set(reasons)] };
}

function manifestRecordsFromPartyNames(
  names: readonly string[],
  intakeText?: string | null,
  draft?: ParsedDraftShape | null,
): CanonicalPartyIdentityRecord[] {
  const intake = String(intakeText ?? "").trim();
  if (intake) {
    const fromLabeled = manifestRecordsFromLabeledPartyBlocks(intake).filter((rec) =>
      isAuthoritativeLegalEntityName(rec.fullLegalName),
    );
    if (fromLabeled.length >= 2) return fromLabeled;
    const fromQuoted = manifestRecordsFromQuotedRoleLines(intake).filter((rec) =>
      isAuthoritativeLegalEntityName(rec.fullLegalName),
    );
    if (fromQuoted.length >= 2) return fromQuoted;
  }

  const unique: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (name.length < 2 || !isAuthoritativeLegalEntityName(name) || unique.includes(name)) continue;
    unique.push(name);
  }
  if (unique.length < 2) return [];

  const partyNames = (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2);
  const roleLabels = (draft?.parties ?? [])
    .map((p) => String(p?.role ?? "").trim())
    .filter((r) => r.length >= 2);
  if (intake && partyNames.length >= 2) {
    const fromIntake = resolveCanonicalPartyIdentitiesFromIntake(
      intake,
      partyNames,
      roleLabels.length >= 2 ? roleLabels : undefined,
    );
    if (fromIntake.length >= unique.length && fromIntake.length >= 2) {
      return fromIntake.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);
    }
  }
  if (intake && unique.length >= 2) {
    const fromIntakeNames = resolveCanonicalPartyIdentitiesFromIntake(intake, unique);
    if (fromIntakeNames.length >= 2) {
      return fromIntakeNames.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);
    }
  }

  const partyCount = Math.min(unique.length, PAID_PRO_AUTHORITY_MAX_PARTIES);
  return unique.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES).map((fullLegalName, index) => ({
    fullLegalName,
    roleLabel: acceptanceManifestRoleLabel(fullLegalName, index, partyCount),
    displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
    signerName: null,
    signerTitle: null,
    partyAddress: null,
  }));
}

/** Intake, labeled blocks, entity pool, and consumed signer metadata — not stale frozen manifest. */
function resolveIntakeAuthorityPartyNames(intakeText: string | null | undefined): string[] {
  const labeled = labeledPartyLegalEntities(intakeText ?? "").filter(isAuthoritativeLegalEntityName);
  if (labeled.length >= 3) return labeled.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);

  const quoted = quotedRolePartyLegalEntities(intakeText ?? "").filter(isAuthoritativeLegalEntityName);
  if (quoted.length >= 3) return quoted.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);

  const entityPool = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(intakeText ?? "").filter(isAuthoritativeLegalEntityName),
  );
  if (entityPool.length >= 3) return entityPool.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);

  const signerNames = (readConsumedPaidProSignerMetadataAuthority()?.parties ?? [])
    .map((p) => String(p.partyLegalName ?? "").trim())
    .filter((n) => isAuthoritativeLegalEntityName(n));
  if (signerNames.length >= 3) return signerNames.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES);

  return [];
}

/** Canonical manifest for 3+ party execution-block shape authority (intake beats stale partial freeze). */
export function resolveAcceptanceManifestRecordsForExecution(args: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): CanonicalPartyIdentityRecord[] {
  const intakeText = args.intakeText ?? null;
  const draft = args.draft ?? null;
  if (intakeText && intakeDescribesBrandLicensingDistributionManufacturingStack(intakeText)) {
    const fromBrandProse = manifestRecordsFromBrandLicensingProseIntake(intakeText, draft);
    if (fromBrandProse.length >= 4) return fromBrandProse;
  }

  const fromConsumedSignerAuthority = manifestRecordsFromConsumedSignerAuthority();
  if (fromConsumedSignerAuthority.length >= 2) {
    return fromConsumedSignerAuthority;
  }

  // Authoritative intake party manifest (colon-role / numbered / bullet) is the single source
  if (intakeText && intakePartyManifestIsAuthoritative(intakeText)) {
    const fromManifest = manifestRecordsFromIntakePartyManifest(intakeText);
    if (fromManifest.length >= 3) return fromManifest;
  }

  const intakeAuthority = resolveIntakeAuthorityPartyNames(intakeText);
  const frozenNames = readFrozenCanonicalManifestPartyNames().filter(isAuthoritativeLegalEntityName);

  if (intakeAuthority.length >= 3) {
    if (frozenNames.length < intakeAuthority.length) {
      return manifestRecordsFromPartyNames(intakeAuthority, intakeText, draft);
    }
    if (frozenNames.length >= 3) {
      return manifestRecordsFromPartyNames(frozenNames, intakeText, draft);
    }
    return manifestRecordsFromPartyNames(intakeAuthority, intakeText, draft);
  }

  if (frozenNames.length >= 3) {
    return manifestRecordsFromPartyNames(frozenNames, intakeText, draft);
  }

  const labeled = labeledPartyLegalEntities(intakeText ?? "").filter(isAuthoritativeLegalEntityName);
  if (labeled.length >= 2) {
    return manifestRecordsFromPartyNames(labeled.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES), intakeText, draft);
  }

  const entityPool = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(intakeText ?? "").filter(isAuthoritativeLegalEntityName),
  );
  if (entityPool.length >= 2) {
    return manifestRecordsFromPartyNames(entityPool.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES), intakeText, draft);
  }

  const partyNames = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2);
  const roleLabels = (args.draft?.parties ?? [])
    .map((p) => String(p?.role ?? "").trim())
    .filter((r) => r.length >= 2);
  if (partyNames.length >= 2 && intakeHasFullLegalEntityParties(args.intakeText ?? null, partyNames)) {
    const fromIntake = resolveCanonicalPartyIdentitiesFromIntake(
      args.intakeText ?? "",
      partyNames,
      roleLabels.length >= 2 ? roleLabels : undefined,
    );
    if (fromIntake.length >= 2) return fromIntake;
  }
  if (partyNames.length >= 2) {
    return manifestRecordsFromPartyNames(partyNames, intakeText, draft);
  }
  return genericPaidProAcceptanceManifestFallback();
}

/** Resolve manifest party records for pre-freeze execution repair (intake, draft, or generic fallback). */
export function manifestRecordsForPaidProAcceptance(args: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): CanonicalPartyIdentityRecord[] {
  return resolveAcceptanceManifestRecordsForExecution(args);
}

/** Placeholder manifest used when no draft/intake party context exists — must not drive SoT synthesis. */
export function genericPaidProAcceptanceManifestFallback(): CanonicalPartyIdentityRecord[] {
  return [
    {
      fullLegalName: "Party 1",
      roleLabel: "Client",
      displayAlias: "Party 1",
      signerName: null,
      signerTitle: null,
      partyAddress: null,
    },
    {
      fullLegalName: "Party 2",
      roleLabel: "Service Provider",
      displayAlias: "Party 2",
      signerName: null,
      signerTitle: null,
      partyAddress: null,
    },
  ];
}

export function isGenericPaidProAcceptanceManifestFallback(
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  if (records.length !== 2) return false;
  return (
    records[0]?.fullLegalName.trim() === "Party 1" &&
    records[1]?.fullLegalName.trim() === "Party 2"
  );
}

export function buildCanonicalExecutionTailFromManifest(
  records: readonly CanonicalPartyIdentityRecord[],
): string {
  const ordered = sortManifestRecordsForExecution(records);
  if (ordered.length >= 3) {
    return buildMultiPartyEntityNameExecutionTailFromManifest(ordered);
  }
  const blocks = ordered.map(buildPartyExecutionSection);
  return [PAID_PRO_ACCEPTANCE_WITNESS_LINE, "", ...blocks].join("\n\n");
}

export function executionHeadingsContainIntakeInstructionLeakage(text: string): boolean {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text.slice(-4000);
  return (
    /\b(?:CLIENT|SERVICE\s+PROVIDER|BUYER|SELLER|LENDER|BORROWER|LANDLORD|TENANT|CONTRACTOR)\s*:\s*(?:Create|Draft|Prepare|Write|Generate)\s+(?:a|an)\b/i.test(
      tail,
    ) ||
    /\b(?:CLIENT|SERVICE\s+PROVIDER)\s*:\s*[^:\n]{0,240}\b(?:between|among)\b[^:\n]{0,240}\b(?:LLC|Inc\.?|Corp\.?)\b/i.test(
      tail,
    )
  );
}

export function executionBlockMatchesManifestRecords(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  if (records.length < 2) return true;
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text.slice(-4000);
  for (const rec of records) {
    const entity = rec.fullLegalName.trim();
    if (!entity) continue;
    const heading = roleToExecutionHeading(rec.roleLabel);
    const pattern = new RegExp(
      `(?:^|\\n\\n)${escapeRegex(heading)}\\s*:\\s*${escapeRegex(entity)}\\b`,
      "im",
    );
    if (!pattern.test(tail)) return false;
  }
  return !executionHeadingsContainIntakeInstructionLeakage(text);
}

function countWitnessClauses(text: string): number {
  return (text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
}

function operativePrefixWithoutExecution(text: string): string {
  const stripped = stripInlineStaleServerSignatureTailBeforeWitness(text);
  const witnessIdx = stripped.text.search(/\bIN WITNESS WHEREOF\b/i);
  let prefix = witnessIdx >= 0 ? stripped.text.slice(0, witnessIdx) : stripped.text;
  const sigStart = prefix.search(
    /(?:^|\n)\s*(?:CLIENT|SERVICE\s+PROVIDER|BUYER|SELLER|LENDER|BORROWER|LANDLORD|TENANT)\s*:\s*(?:\n|$)/im,
  );
  if (sigStart >= 0 && witnessIdx < 0) {
    prefix = prefix.slice(0, sigStart);
  }
  const inlineSig = prefix.search(/\bSIGNATURES\b\s+(?:The\s+parties\s+have\s+caused|have\s+caused)/i);
  if (inlineSig >= 0) {
    prefix = prefix.slice(0, inlineSig);
  }
  return prefix.trimEnd();
}

function stripStaleSignatureRoleBlocksFromPrefix(prefix: string): string {
  let out = prefix;
  const staleClient = out.search(/(?:^|\n)\s*CLIENT\s*:/im);
  if (staleClient >= 0) out = out.slice(0, staleClient).trimEnd();
  const staleProvider = out.search(/(?:^|\n)\s*SERVICE\s+PROVIDER\s*:/im);
  if (staleProvider >= 0) out = out.slice(0, staleProvider).trimEnd();
  return out;
}

function rebuildCanonicalExecutionTailFromPrefix(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): string {
  const prefix = stripStaleSignatureRoleBlocksFromPrefix(operativePrefixWithoutExecution(text));
  const tail = buildCanonicalExecutionTailFromManifest(records);
  // Keep signature blocks before exhibits so users see them at the natural document end.
  const exhibitIdx = prefix.search(/(?:^|\n)\s*EXHIBIT\s+[A-Z0-9]/im);
  if (exhibitIdx >= 0) {
    const before = prefix.slice(0, exhibitIdx).trimEnd();
    const exhibits = prefix.slice(exhibitIdx).trim();
    return `${before}\n\n${tail}\n\n${exhibits}\n`.replace(/\n{3,}/g, "\n\n").trim();
  }
  return `${prefix}\n\n${tail}\n`.replace(/\n{3,}/g, "\n\n").trim();
}

function executionBlockCoversManifestPartyNames(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): boolean {
  if (records.length < 3) return true;
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : text.slice(-3000);
  const present = records.filter((rec) => tail.includes(rec.fullLegalName.trim())).length;
  if (present < records.length) return false;
  return countProperMultiPartyEntitySignatureSections(tail, records) >= records.length;
}

/**
 * Repair or normalize execution block before SoT freeze / acceptance.
 * Appends canonical tail when witness/execution count is not exactly one.
 */
export function ensurePaidProAcceptanceExecutionBlockInvariant(
  text: string,
  records: readonly CanonicalPartyIdentityRecord[],
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = String(text || "").replace(/\r\n/g, "\n").trim();
  if (records.length < 2) return { text: out, repairs };

  const staleTailRemoval = removeStalePreWitnessExecutionTail(out);
  if (staleTailRemoval.repairs.length > 0) {
    out = staleTailRemoval.text;
    repairs.push(...staleTailRemoval.repairs.map((r) => `acceptance_execution_block:${r}`));
  }

  const witnessCount = countWitnessClauses(out);
  const executionBlockCount = countPaidProExecutionBlocks(out);
  const partyCount = records.length;
  const shapeAudit =
    partyCount >= 3 ? analyzeMultiPartyExecutionBlockShape(out, records) : { malformed: false, reasons: [] };
  const invariant = analyzePaidProExecutionBlockInvariant(out, {
    expectedParties: partyCount >= 3 ? partyCount : 2,
  });

  const authorityParties = records.map((rec) => ({ partyLegalName: rec.fullLegalName }));

  if (
    witnessCount === 1 &&
    executionBlockCount === 1 &&
    invariant.ok &&
    !shapeAudit.malformed &&
    executionBlockCoversManifestPartyNames(out, records) &&
    !executionHeadingsContainIntakeInstructionLeakage(out)
  ) {
    return { text: out, repairs: [...new Set(repairs)] };
  }

  if (executionHeadingsContainIntakeInstructionLeakage(out)) {
    out = rebuildCanonicalExecutionTailFromPrefix(out, records);
    repairs.push("acceptance_execution_block:intake_instruction_heading_repair");
  } else if (witnessCount === 0 || executionBlockCount === 0 || shapeAudit.malformed) {
    out = rebuildCanonicalExecutionTailFromPrefix(out, records);
    repairs.push(
      shapeAudit.malformed
        ? `acceptance_execution_block:multi_party_shape_repair:${shapeAudit.reasons.join(";")}`
        : "acceptance_execution_block:appended_canonical_tail",
    );
  } else {
    const normalized = enforcePaidProSingleExecutionBlock(out, { authorityParties });
    if (normalized.text !== out) {
      out = normalized.text;
      repairs.push(...normalized.repairs, "acceptance_execution_block:deduped_to_single");
    }
  }

  const afterWitness = countWitnessClauses(out);
  const afterBlocks = countPaidProExecutionBlocks(out);
  const afterShape =
    partyCount >= 3 ? analyzeMultiPartyExecutionBlockShape(out, records) : { malformed: false, reasons: [] };
  const afterInvariant = analyzePaidProExecutionBlockInvariant(out, {
    expectedParties: partyCount >= 3 ? partyCount : 2,
  });
  if (afterWitness !== 1 || afterBlocks !== 1 || !afterInvariant.ok || afterShape.malformed) {
    out = rebuildCanonicalExecutionTailFromPrefix(out, records);
    repairs.push("acceptance_execution_block:appended_canonical_tail_fallback");
  }

  const preAssert = analyzePaidProExecutionBlockInvariant(out, {
    expectedParties: partyCount >= 3 ? partyCount : 2,
  });
  if (
    !preAssert.ok &&
    preAssert.violations.some((v) =>
      /^(?:client|service_provider)_(?:heading|signature_section)_duplicate:/.test(v),
    )
  ) {
    out = rebuildCanonicalExecutionTailFromPrefix(out, records);
    repairs.push("acceptance_execution_block:duplicate_tail_rebuild");
  }

  assertPaidProSingleExecutionBlock(out, "ensurePaidProAcceptanceExecutionBlockInvariant", {
    expectedParties: partyCount >= 3 ? partyCount : 2,
  });
  return { text: out, repairs: [...new Set(repairs)] };
}
