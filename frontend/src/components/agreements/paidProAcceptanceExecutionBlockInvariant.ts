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
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
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

function acceptanceManifestRoleLabel(fullLegalName: string, index: number, partyCount: number): string {
  if (partyCount >= 3) return fullLegalName.trim();
  if (index === 0) return "Client";
  if (index === 1) return "Service Provider";
  return `Party ${index + 1}`;
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

function manifestRecordsFromPartyNames(names: readonly string[]): CanonicalPartyIdentityRecord[] {
  const unique: string[] = [];
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (name.length < 2 || !isAuthoritativeLegalEntityName(name) || unique.includes(name)) continue;
    unique.push(name);
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
  const intakeAuthority = resolveIntakeAuthorityPartyNames(args.intakeText);
  const frozenNames = readFrozenCanonicalManifestPartyNames().filter(isAuthoritativeLegalEntityName);

  if (intakeAuthority.length >= 3) {
    if (frozenNames.length < intakeAuthority.length) {
      return manifestRecordsFromPartyNames(intakeAuthority);
    }
    if (frozenNames.length >= 3) {
      return manifestRecordsFromPartyNames(frozenNames);
    }
    return manifestRecordsFromPartyNames(intakeAuthority);
  }

  if (frozenNames.length >= 3) {
    return manifestRecordsFromPartyNames(frozenNames);
  }

  const labeled = labeledPartyLegalEntities(args.intakeText ?? "").filter(isAuthoritativeLegalEntityName);
  if (labeled.length >= 2) {
    return manifestRecordsFromPartyNames(labeled.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES));
  }

  const entityPool = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(args.intakeText ?? "").filter(isAuthoritativeLegalEntityName),
  );
  if (entityPool.length >= 2) {
    return manifestRecordsFromPartyNames(entityPool.slice(0, PAID_PRO_AUTHORITY_MAX_PARTIES));
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
    return manifestRecordsFromPartyNames(partyNames);
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
    executionBlockCoversManifestPartyNames(out, records)
  ) {
    if (partyCount < 3) {
      const normalized = enforcePaidProSingleExecutionBlock(out, { authorityParties });
      if (normalized.text !== out) {
        repairs.push(...normalized.repairs);
        out = normalized.text;
      }
    }
    return { text: out, repairs: [...new Set(repairs)] };
  }

  if (witnessCount === 0 || executionBlockCount === 0 || shapeAudit.malformed) {
    const prefix = operativePrefixWithoutExecution(out);
    const tail = buildCanonicalExecutionTailFromManifest(records);
    out = `${prefix}\n\n${tail}\n`.replace(/\n{3,}/g, "\n\n").trim();
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
    const prefix = operativePrefixWithoutExecution(out);
    out = `${prefix}\n\n${buildCanonicalExecutionTailFromManifest(records)}\n`
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    repairs.push("acceptance_execution_block:appended_canonical_tail_fallback");
  }

  assertPaidProSingleExecutionBlock(out, "ensurePaidProAcceptanceExecutionBlockInvariant", {
    expectedParties: partyCount >= 3 ? partyCount : 2,
  });
  return { text: out, repairs: [...new Set(repairs)] };
}
