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
import {
  analyzePaidProExecutionBlockInvariant,
  assertPaidProSingleExecutionBlock,
  countPaidProExecutionBlocks,
} from "./paidProExecutionBlockAuthority";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { stripInlineStaleServerSignatureTailBeforeWitness } from "./paidProFlattenedDocumentNormalize";

export const PAID_PRO_ACCEPTANCE_WITNESS_LINE =
  "IN WITNESS WHEREOF, the Parties execute this Agreement.";

function roleToExecutionHeading(roleLabel: string): string {
  const r = roleLabel.replace(/\s+/g, " ").trim().toLowerCase();
  if (r === "client") return "CLIENT";
  if (r.includes("service") && r.includes("provider")) return "SERVICE PROVIDER";
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
  const clientIdx = records.findIndex((r) => /^client$/i.test(r.roleLabel.trim()));
  const providerIdx = records.findIndex((r) =>
    /service\s+provider|^provider$/i.test(r.roleLabel.trim()),
  );
  if (clientIdx >= 0 && providerIdx >= 0 && clientIdx !== providerIdx) {
    return [records[clientIdx]!, records[providerIdx]!];
  }
  return records.slice(0, 2);
}

function buildPartyExecutionSection(rec: CanonicalPartyIdentityRecord): string {
  const heading = roleToExecutionHeading(rec.roleLabel);
  return [
    `${heading}:`,
    rec.fullLegalName,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");
}

/** Canonical LawDog execution tail from manifest party records (pre-freeze acceptance only). */
/** Resolve manifest party records for pre-freeze execution repair (intake, draft, or generic fallback). */
export function manifestRecordsForPaidProAcceptance(args: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): CanonicalPartyIdentityRecord[] {
  const partyNames = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 2)
    .slice(0, 2);
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
    return partyNames.map((fullLegalName, index) => ({
      fullLegalName,
      roleLabel: roleLabels[index] || (index === 0 ? "Client" : "Service Provider"),
      displayAlias: fullLegalName.split(/\s+/).slice(0, 2).join(" "),
      signerName: null,
      signerTitle: null,
      partyAddress: null,
    }));
  }
  return genericPaidProAcceptanceManifestFallback();
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
  const invariant = analyzePaidProExecutionBlockInvariant(out);

  const authorityParties = records.map((rec) => ({ partyLegalName: rec.fullLegalName }));

  if (witnessCount === 1 && executionBlockCount === 1 && invariant.ok) {
    const normalized = enforcePaidProSingleExecutionBlock(out, { authorityParties });
    if (normalized.text !== out) {
      repairs.push(...normalized.repairs);
      out = normalized.text;
    }
    return { text: out, repairs: [...new Set(repairs)] };
  }

  if (witnessCount === 0 || executionBlockCount === 0) {
    const prefix = operativePrefixWithoutExecution(out);
    const tail = buildCanonicalExecutionTailFromManifest(records);
    out = `${prefix}\n\n${tail}\n`.replace(/\n{3,}/g, "\n\n").trim();
    repairs.push("acceptance_execution_block:appended_canonical_tail");
  } else {
    const normalized = enforcePaidProSingleExecutionBlock(out, { authorityParties });
    if (normalized.text !== out) {
      out = normalized.text;
      repairs.push(...normalized.repairs, "acceptance_execution_block:deduped_to_single");
    }
  }

  const afterWitness = countWitnessClauses(out);
  const afterBlocks = countPaidProExecutionBlocks(out);
  const afterInvariant = analyzePaidProExecutionBlockInvariant(out);
  if (afterWitness !== 1 || afterBlocks !== 1 || !afterInvariant.ok) {
    const prefix = operativePrefixWithoutExecution(out);
    out = `${prefix}\n\n${buildCanonicalExecutionTailFromManifest(records)}\n`
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    repairs.push("acceptance_execution_block:appended_canonical_tail_fallback");
  }

  assertPaidProSingleExecutionBlock(out, "ensurePaidProAcceptanceExecutionBlockInvariant");
  return { text: out, repairs: [...new Set(repairs)] };
}
