/**
 * Central resolver + invariant for completed execution-block metadata (By / Name / party slot).
 * Every completed artifact path must agree: By value matches that party's signer Name.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  extractRoleEntityNamesFromPortableRoles,
  isEntityLegalNameHeadingLine,
} from "./vs01ExecutionBlockHeading";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import {
  parseSignatureCompletedEventsFromAudit,
  reconstructSignedCorpusFromAuditAndPortable,
} from "./vs01FullyExecutedSignedSnapshot";
import { resolveWitnessExecutionScanStart } from "./vs01WitnessBlockSigningDate";
import {
  logCompletedSignerOverlaySource,
  resolveCompletedSignerByText,
} from "./completedSignerOverlayResolver";

export type CompletedExecutionBlockRow = {
  partyIndex: number;
  partyLegalName: string;
  recipientIndex: number;
  signerRoleId: string;
  signerName: string;
  signerEmail: string;
  title: string;
  byValue: string;
  nameValue: string;
  dateValue: string;
};

export type CompletedExecutionMetadataValidation = {
  ok: boolean;
  rows: CompletedExecutionBlockRow[];
  violations: string[];
};

function fieldValue(line: string, label: string): string {
  const re = new RegExp(`^${label}\\s*:\\s*(.*)$`, "i");
  const m = line.trim().match(re);
  return (m?.[1] ?? "").trim().replace(/_{2,}/g, "").trim();
}

function normalizeSignerLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Parse witness execution blocks keyed by partyIndex. */
export function parseCompletedExecutionBlocksFromCorpus(
  corpusPlain: string,
  roleEntityNames?: readonly string[],
): CompletedExecutionBlockRow[] {
  const patchStart = resolveWitnessExecutionScanStart(corpusPlain);
  const lines = corpusPlain.split("\n");
  const entityNames = roleEntityNames ?? [];
  const blocks = new Map<
    number,
    {
      partyLegalName: string;
      byValue: string;
      nameValue: string;
      title: string;
      dateValue: string;
    }
  >();

  let currentPartyIndex = -1;
  let currentEntity = "";

  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = i === 0 ? 0 : lines.slice(0, i).join("\n").length + 1;
    if (lineStart < patchStart) continue;

    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    if (isEntityLegalNameHeadingLine(trimmed)) {
      currentEntity = trimmed.replace(/:\s*$/, "").trim();
      const norm = currentEntity.toLowerCase();
      const fromRoles = entityNames.findIndex((n) => n.trim().toLowerCase() === norm);
      currentPartyIndex = fromRoles >= 0 ? fromRoles : blocks.size;
      if (!blocks.has(currentPartyIndex)) {
        blocks.set(currentPartyIndex, {
          partyLegalName: currentEntity,
          byValue: "",
          nameValue: "",
          title: "",
          dateValue: "",
        });
      }
      continue;
    }

    if (currentPartyIndex < 0) continue;
    const block = blocks.get(currentPartyIndex);
    if (!block) continue;

    if (/^by\s*:/i.test(trimmed)) block.byValue = fieldValue(trimmed, "By");
    else if (/^name\s*:/i.test(trimmed)) block.nameValue = fieldValue(trimmed, "Name");
    else if (/^title\s*:/i.test(trimmed)) block.title = fieldValue(trimmed, "Title");
    else if (/^date\s*:/i.test(trimmed)) block.dateValue = fieldValue(trimmed, "Date");
  }

  return [...blocks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([partyIndex, block]) => ({
      partyIndex,
      partyLegalName: block.partyLegalName,
      recipientIndex: partyIndex,
      signerRoleId: "",
      signerName: block.nameValue,
      signerEmail: "",
      title: block.title,
      byValue: block.byValue,
      nameValue: block.nameValue,
      dateValue: block.dateValue,
    }));
}

function enrichRowsFromPortable(
  rows: CompletedExecutionBlockRow[],
  portable: Vs01CanonicalPacketPortableV1 | null | undefined,
): CompletedExecutionBlockRow[] {
  if (!portable?.roles?.length) return rows;
  const roleEntityNames = extractRoleEntityNamesFromPortableRoles(portable.roles);
  return rows.map((row) => {
    const role =
      portable.roles.find((r) => (r.partyIndex ?? -1) === row.partyIndex) ??
      portable.roles[row.partyIndex];
    const entity =
      (role?.entityName || role?.partyName || roleEntityNames[row.partyIndex] || row.partyLegalName).trim();
    const signerName = (role?.signerName || row.nameValue).trim();
    return {
      ...row,
      partyLegalName: entity || row.partyLegalName,
      signerRoleId: (role?.roleId ?? "").trim(),
      signerName: signerName || row.nameValue,
      signerEmail: (role?.signerEmail ?? role?.reviewEmail ?? "").trim(),
      title: (role?.signerTitle ?? row.title).trim() || row.title,
      recipientIndex: role?.partyIndex ?? row.partyIndex,
    };
  });
}

export function validateCompletedExecutionMetadataInvariant(args: {
  corpusPlain: string;
  portable?: Vs01CanonicalPacketPortableV1 | null;
}): CompletedExecutionMetadataValidation {
  const roleEntityNames = args.portable
    ? extractRoleEntityNamesFromPortableRoles(args.portable.roles)
    : undefined;
  const parsed = parseCompletedExecutionBlocksFromCorpus(args.corpusPlain, roleEntityNames);
  const rows = enrichRowsFromPortable(parsed, args.portable);
  const violations: string[] = [];

  for (const row of rows) {
    const by = row.byValue.trim();
    const name = row.nameValue.trim();
    const expected = (row.signerName || name).trim();
    if (!by || !name) continue;
    if (normalizeSignerLabel(by) !== normalizeSignerLabel(name)) {
      violations.push(
        `party ${row.partyIndex} (${row.partyLegalName}): By "${by}" !== Name "${name}"`,
      );
    }
    if (expected && normalizeSignerLabel(by) !== normalizeSignerLabel(expected)) {
      violations.push(
        `party ${row.partyIndex} (${row.partyLegalName}): By "${by}" !== signerName "${expected}"`,
      );
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const prev = i > 0 ? rows[i - 1]! : null;
    const by = row.byValue.trim();
    const name = row.nameValue.trim();
    if (prev && by && prev.byValue.trim()) {
      if (
        normalizeSignerLabel(by) === normalizeSignerLabel(prev.byValue) &&
        name &&
        prev.nameValue.trim() &&
        normalizeSignerLabel(name) !== normalizeSignerLabel(prev.nameValue)
      ) {
        violations.push(
          `party ${row.partyIndex} By duplicates party ${prev.partyIndex} signer "${by}" while Name differs`,
        );
      }
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (!a.byValue.trim() || !b.byValue.trim()) continue;
      if (normalizeSignerLabel(a.byValue) === normalizeSignerLabel(b.byValue) && a.partyIndex !== b.partyIndex) {
        violations.push(
          `party ${b.partyIndex} By duplicates party ${a.partyIndex} signer "${a.byValue}"`,
        );
      }
    }
  }

  return { ok: violations.length === 0, rows, violations };
}

/** Log resolved By/Name per party once for a completed artifact surface. */
export function logCompletedExecutionCorpusOverlaySources(args: {
  agreementId: string;
  source: string;
  corpusPlain: string;
  portable?: Vs01CanonicalPacketPortableV1 | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const roleEntityNames = args.portable
    ? extractRoleEntityNamesFromPortableRoles(args.portable.roles)
    : undefined;
  const parsed = parseCompletedExecutionBlocksFromCorpus(args.corpusPlain, roleEntityNames);
  const rows = enrichRowsFromPortable(parsed, args.portable);
  for (const row of rows) {
    const role =
      args.portable?.roles.find((r) => (r.partyIndex ?? -1) === row.partyIndex) ??
      args.portable?.roles[row.partyIndex];
    const signerRoleId = (role?.roleId ?? row.signerRoleId).trim() || `party_${row.partyIndex}`;
    const resolved = resolveCompletedSignerByText({
      agreementId: args.agreementId,
      source: args.source,
      signerRoleId,
      partyIndex: row.partyIndex,
      signerEmail: role?.signerEmail ?? role?.reviewEmail,
      roleSignerName: role?.signerName ?? row.nameValue,
      auditDisplayName: row.nameValue,
      fields: args.portable?.fields ?? [],
    });
    logCompletedSignerOverlaySource({
      agreementId: args.agreementId,
      source: args.source,
      partyIndex: row.partyIndex,
      partyName: row.partyLegalName,
      signerRoleId,
      auditDisplayName: row.nameValue,
      fieldAssignedSignerRoleId: resolved.fieldAssignedSignerRoleId,
      resolvedBy: row.byValue.trim() || resolved.byText,
      resolvedName: row.nameValue.trim() || (role?.signerName ?? "").trim(),
      fallbackUsed: resolved.fallbackUsed,
    });
  }
}

export function assertCompletedExecutionMetadataInvariant(args: {
  corpusPlain: string;
  portable?: Vs01CanonicalPacketPortableV1 | null;
  source: string;
}): void {
  const result = validateCompletedExecutionMetadataInvariant(args);
  if (result.ok) return;
  const inTest = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
  const inDev = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
  if (!inTest && !inDev) {
    // eslint-disable-next-line no-console
    console.error("[completed-execution-metadata-invariant]", {
      source: args.source,
      violations: result.violations,
    });
    return;
  }
  throw new Error(
    `[completed-execution-metadata-invariant] ${args.source}: ${result.violations.join("; ")}`,
  );
}

export type ResolvedCompletedExecutionCorpus = {
  text: string;
  source: "fully_executed_snapshot" | "reconstructed" | "portable_packet";
  validation: CompletedExecutionMetadataValidation;
};

/**
 * Resolve completed signed corpus with invariant enforcement.
 * Prefers authoritative snapshot; falls back to audit reconstruction when snapshot violates By/Name parity.
 */
export function resolveAuthoritativeCompletedExecutionCorpus(args: {
  draft: AgreementDraft;
  portable: Vs01CanonicalPacketPortableV1 | null;
  snapshotCorpus?: string | null;
  preferSource?: "fully_executed_snapshot" | "reconstructed" | "portable_packet";
}): ResolvedCompletedExecutionCorpus | null {
  const portable = args.portable;
  const snapshot = (args.snapshotCorpus ?? "").trim();

  const tryCorpus = (
    text: string,
    source: ResolvedCompletedExecutionCorpus["source"],
  ): ResolvedCompletedExecutionCorpus | null => {
    const trimmed = text.trim();
    if (trimmed.length < 80) return null;
    const validation = validateCompletedExecutionMetadataInvariant({ corpusPlain: trimmed, portable });
    if (validation.ok) {
      return { text: trimmed, source, validation };
    }
    return null;
  };

  if (snapshot) {
    const snapResult = tryCorpus(snapshot, args.preferSource ?? "fully_executed_snapshot");
    if (snapResult) return snapResult;
  }

  if (portable && args.draft) {
    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({ draft: args.draft, portable });
    if (rebuilt?.trim()) {
      const rebuiltResult = tryCorpus(rebuilt, "reconstructed");
      if (rebuiltResult) return rebuiltResult;
    }
  }

  const events = parseSignatureCompletedEventsFromAudit(args.draft.audit_log);
  if (snapshot && events.length) {
    const fallback = snapshot;
    assertCompletedExecutionMetadataInvariant({
      corpusPlain: fallback,
      portable,
      source: args.preferSource ?? "fully_executed_snapshot",
    });
    return {
      text: fallback,
      source: args.preferSource ?? "fully_executed_snapshot",
      validation: validateCompletedExecutionMetadataInvariant({ corpusPlain: fallback, portable }),
    };
  }

  return null;
}
