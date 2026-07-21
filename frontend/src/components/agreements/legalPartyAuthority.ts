/**
 * Phase 1 — tier-neutral legal-party authority (Starter intake → review/gating).
 * Signer, paid SoT, and execution metadata belong in Phase 2.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  mergeIntakeDeclaredRolesIntoPartyHints,
  resolveCanonicalPartyRoleLabel,
  extractBetweenCommaRoleHints,
  extractBetweenPartySegmentRoleHints,
} from "./canonicalPartyRoleAuthority";
import {
  partyIdForLabeledPartyNumber,
  partyIdFromStableKey,
  resolvePartyId,
} from "./canonicalPartyIdentityModel";
import {
  labeledPartyLegalEntities,
  parseLabeledPartyBlocks,
  quotedRolePartyLegalEntities,
} from "./labeledPartyBlockParse";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import {
  extractBetweenPartyNameList,
  extractBetweenPartyNameListForAuthority,
  isBetweenClausePartyCandidate,
} from "./partyBetweenParse";
import { stripPartyRoleAnnotations } from "./partyRoleAnnotations";
import {
  extractLineSeparatedLegalEntityParties,
} from "./partySlotIdentityNormalize";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { isPlaceholderPartyName } from "./starterPartyLimits";

const COORDINATOR_BLOCK_HEADER_RE = /^\s*coordinator\s*[:\-]?\s*$/i;
const PARTY_BLOCK_HEADER_RE = /^\s*party\s*(\d+)\s*[:\-]?\s*$/i;

function intakeHasCoordinatorBlock(raw: string): boolean {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  return lines.some((line) => COORDINATOR_BLOCK_HEADER_RE.test(line.trim()));
}

function parseCoordinatorNameFromIntake(raw: string): string | null {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let inCoordinator = false;
  let name = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (COORDINATOR_BLOCK_HEADER_RE.test(line)) {
      inCoordinator = true;
      continue;
    }
    if (PARTY_BLOCK_HEADER_RE.test(line)) {
      if (inCoordinator) break;
      inCoordinator = false;
      continue;
    }
    if (inCoordinator) {
      const nameMatch = line.match(/^\s*name\s*[:\-]\s*(.+)$/i);
      if (nameMatch?.[1]) {
        name = nameMatch[1].replace(/\s+/g, " ").trim();
      }
    }
  }
  return name.length >= 2 ? name : null;
}

export type LegalPartyConfidenceLevel = "high" | "medium" | "low";
export type LegalPartyRoleConfidence = LegalPartyConfidenceLevel | "unknown";

export type LegalPartyProvenanceSource =
  | "labeled_block"
  | "structured_intake"
  | "between_clause"
  | "explicit_user_field"
  | "fallback";

export type LegalPartyAuthorityRecord = {
  agreementPartyId: string;
  legalEntityName: string;
  agreementRole?: string;
  commercialRoles: string[];
  sourceMentionIndex?: number;
  canonicalOrder: number;
  confidence: {
    entity: LegalPartyConfidenceLevel;
    role: LegalPartyRoleConfidence;
  };
  provenance: {
    extractedFrom: LegalPartyProvenanceSource;
    fallbackReason?: string;
  };
};

export type LegalPartyAuthorityResult = {
  parties: LegalPartyAuthorityRecord[];
  intakeFingerprint: string;
  fallbackCount: number;
  establishedAt: number;
};

/** @see isBetweenClausePartyCandidate */
export const isContractingPartyNameForAuthority = isBetweenClausePartyCandidate;

function normalizePartyNameForAuthority(raw: string): string {
  let name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return name;
  if (/\s+for\s+/i.test(name) && wordCount(name) > 3) {
    const purposeStrip = name.match(/^(.+?)\s+for\s+(?!Signer\b)([A-Za-z][\s\S]+)$/i);
    if (purposeStrip?.[1]) {
      const tail = purposeStrip[2].trim();
      if (!/(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|Holdings)\b/i.test(tail)) {
        name = purposeStrip[1].replace(/[,;:]+$/, "").trim();
      }
    }
  }
  return name;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function dedupeContractingParties(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = normalizePartyNameForAuthority(String(raw ?? "").replace(/\s+/g, " ").trim());
    if (name.length < 2 || !isBetweenClausePartyCandidate(name)) continue;
    const key = normalizeEntityKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function normalizeEntityKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

type EvidenceRow = {
  name: string;
  provenance: LegalPartyProvenanceSource;
  entityConfidence: LegalPartyConfidenceLevel;
  roleHint?: string;
  roleConfidence: LegalPartyRoleConfidence;
  labeledPartyNumber?: number;
  mentionIndex: number;
};

function resolveRoleForParty(
  name: string,
  roleHints: Record<string, string>,
  partyCount: number,
  mentionIndex: number,
): { role?: string; confidence: LegalPartyRoleConfidence } {
  const hint = roleHints[normalizeEntityKey(name)] ?? roleHints[name.toLowerCase()];
  if (hint?.trim()) {
    const normalized = resolveCanonicalPartyRoleLabel({
      partyIndex: mentionIndex,
      partyCount,
      explicitRole: hint,
      preserveIntakeRole: true,
    });
    if (normalized && !/^(?:party|parties)$/i.test(normalized)) {
      return { role: normalized, confidence: "high" };
    }
    return { role: titleCaseRole(hint), confidence: "medium" };
  }
  return { role: undefined, confidence: "unknown" };
}

function titleCaseRole(role: string): string {
  return role
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function resolveRoleHintsForIntake(intake: string): Record<string, string> {
  const structured = parseIntakeToStructuredAgreement(intake);
  const betweenPreview = extractBetweenPartyNameListForAuthority(intake);
  const partyNamesForHints =
    betweenPreview.length >= structured.parties.length ? betweenPreview : structured.parties;
  return mergeIntakeDeclaredRolesIntoPartyHints(
    partyNamesForHints.length > 0 ? partyNamesForHints : structured.parties,
    {
      ...extractBetweenPartySegmentRoleHints(intake),
      ...extractBetweenCommaRoleHints(intake),
      ...structured.partyRoleHints,
    },
    intake,
  );
}

function parseWithClauseAdditionalParties(intake: string): Array<{ name: string; roleHint?: string }> {
  const m = intake.match(/,\s*with\s+([^.;]+?)(?:\.\s|$)/i);
  if (!m?.[1]) return [];
  const { name, role } = stripPartyRoleAnnotations(m[1].trim());
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!isBetweenClausePartyCandidate(cleaned)) return [];
  return [{ name: cleaned, roleHint: role ?? undefined }];
}

function parseSignerLabelPartyNames(intake: string): string[] {
  const lines = String(intake || "").replace(/\r\n/g, "\n").split("\n");
  const names: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(/^signer\s*\d+\s*[:\-]\s*(.+)$/i);
    if (!m?.[1]) continue;
    const name = m[1].replace(/\s+/g, " ").trim();
    if (isBetweenClausePartyCandidate(name)) names.push(name);
  }
  return names;
}

function collectEvidence(intakeText: string): EvidenceRow[] {
  const intake = String(intakeText ?? "").trim();
  if (!intake) return [];

  const structured = parseIntakeToStructuredAgreement(intake);
  const roleHints = resolveRoleHintsForIntake(intake);
  const rows: EvidenceRow[] = [];
  let mentionIndex = 0;

  const pushRow = (row: Omit<EvidenceRow, "mentionIndex">) => {
    rows.push({ ...row, mentionIndex: mentionIndex++ });
  };

  const signerLabels = parseSignerLabelPartyNames(intake);
  if (signerLabels.length >= 2) {
    for (const name of signerLabels) {
      pushRow({
        name,
        provenance: "explicit_user_field",
        entityConfidence: "high",
        roleConfidence: "unknown",
      });
    }
    if (rows.length >= 2) return applyRoleHintsToRows(rows, roleHints);
  }

  rows.length = 0;
  mentionIndex = 0;

  const labeledBlocks = parseLabeledPartyBlocks(intake);
  if (labeledBlocks.length >= 2) {
    for (const block of labeledBlocks) {
      const name = block.legalEntity.trim();
      if (!isBetweenClausePartyCandidate(name)) continue;
      const roleHint = block.roleLabel.trim() || undefined;
      pushRow({
        name,
        provenance: "labeled_block",
        entityConfidence: "high",
        roleHint,
        roleConfidence: roleHint ? "high" : "unknown",
        labeledPartyNumber: block.index,
      });
    }
    if (rows.length >= 2) return applyRoleHintsToRows(rows, roleHints);
  }

  rows.length = 0;
  mentionIndex = 0;

  const betweenBase = extractBetweenPartyNameListForAuthority(intake);
  const withClause = parseWithClauseAdditionalParties(intake);
  const betweenNames = dedupeContractingParties([
    ...betweenBase,
    ...withClause.map((w) => w.name),
  ]);
  const withRoleByKey = new Map(
    withClause.filter((w) => w.roleHint).map((w) => [normalizeEntityKey(w.name), w.roleHint!]),
  );
  if (betweenNames.length >= 2) {
    for (const name of betweenNames) {
      const key = normalizeEntityKey(name);
      const withRole = withRoleByKey.get(key);
      pushRow({
        name: normalizePartyNameForAuthority(name),
        provenance: "between_clause",
        entityConfidence: "high",
        roleHint: withRole,
        roleConfidence: withRole ? "high" : "unknown",
      });
    }
    return applyRoleHintsToRows(rows, roleHints);
  }

  const quoted = quotedRolePartyLegalEntities(intake);
  const lineSeparated = extractLineSeparatedLegalEntityParties(intake);
  const explicitField = dedupeContractingParties([...quoted, ...lineSeparated]);
  if (explicitField.length >= 2) {
    for (const name of explicitField) {
      pushRow({
        name,
        provenance: "explicit_user_field",
        entityConfidence: "high",
        roleConfidence: "unknown",
      });
    }
    return applyRoleHintsToRows(rows, roleHints);
  }

  if (!structured.partiesUncertain && structured.parties.length >= 2) {
    const filtered = dedupeContractingParties(structured.parties);
    if (filtered.length >= 2) {
      for (const name of filtered) {
        pushRow({
          name,
          provenance: "structured_intake",
          entityConfidence: filtered.length === structured.parties.length ? "high" : "medium",
          roleConfidence: "unknown",
        });
      }
      return applyRoleHintsToRows(rows, roleHints);
    }
  }

  const labeledEntities = dedupeContractingParties(labeledPartyLegalEntities(intake));
  if (labeledEntities.length >= 2) {
    for (const name of labeledEntities) {
      pushRow({
        name,
        provenance: "labeled_block",
        entityConfidence: "medium",
        roleConfidence: "unknown",
      });
    }
    return applyRoleHintsToRows(rows, roleHints);
  }

  const betweenFallback = dedupeContractingParties(extractBetweenPartyNameList(intake));
  if (betweenFallback.length >= 2) {
    for (const name of betweenFallback) {
      pushRow({
        name,
        provenance: "between_clause",
        entityConfidence: "medium",
        roleConfidence: "unknown",
      });
    }
    return applyRoleHintsToRows(rows, roleHints);
  }

  return [];
}

function applyRoleHintsToRows(
  rows: EvidenceRow[],
  roleHints: Record<string, string>,
): EvidenceRow[] {
  return rows.map((row) => {
    const hint = roleHints[normalizeEntityKey(row.name)];
    if (!hint) return row;
    return {
      ...row,
      roleHint: hint,
      roleConfidence: "medium" as const,
    };
  });
}

function excludeCoordinator(rows: EvidenceRow[], intake: string): EvidenceRow[] {
  if (!intakeHasCoordinatorBlock(intake)) return rows;
  const coordinator = parseCoordinatorNameFromIntake(intake)?.trim().toLowerCase();
  if (!coordinator) return rows;
  return rows.filter((r) => normalizeEntityKey(r.name) !== coordinator);
}

function rowsToAuthorityRecords(rows: EvidenceRow[], roleHints: Record<string, string>): LegalPartyAuthorityRecord[] {
  const partyCount = rows.length;
  return rows.map((row, index) => {
    const { role, confidence: roleConfidence } = resolveRoleForParty(
      row.name,
      { ...roleHints, ...(row.roleHint ? { [normalizeEntityKey(row.name)]: row.roleHint } : {}) },
      partyCount,
      index,
    );
    const agreementPartyId = resolvePartyId(
      row.name,
      index,
      row.labeledPartyNumber,
      row.labeledPartyNumber != null ? partyIdForLabeledPartyNumber(row.labeledPartyNumber) : undefined,
    );
    return {
      agreementPartyId,
      legalEntityName: row.name,
      agreementRole: role ?? row.roleHint,
      commercialRoles: role ? [role] : [],
      sourceMentionIndex: row.mentionIndex,
      canonicalOrder: index,
      confidence: {
        entity: row.entityConfidence,
        role: row.roleHint ? row.roleConfidence : roleConfidence,
      },
      provenance: { extractedFrom: row.provenance },
    };
  });
}

function buildPlaceholderAuthority(reason: string): LegalPartyAuthorityRecord[] {
  return [
    {
      agreementPartyId: partyIdFromStableKey("Party A", 0),
      legalEntityName: "Party A",
      agreementRole: undefined,
      commercialRoles: [],
      sourceMentionIndex: 0,
      canonicalOrder: 0,
      confidence: { entity: "low", role: "unknown" },
      provenance: { extractedFrom: "fallback", fallbackReason: reason },
    },
    {
      agreementPartyId: partyIdFromStableKey("Party B", 1),
      legalEntityName: "Party B",
      agreementRole: undefined,
      commercialRoles: [],
      sourceMentionIndex: 1,
      canonicalOrder: 1,
      confidence: { entity: "low", role: "unknown" },
      provenance: { extractedFrom: "fallback", fallbackReason: reason },
    },
  ];
}

/**
 * Single early writer — reconciles labeled, between, structured, and explicit intake evidence.
 */
export function establishLegalPartyAuthorityFromIntake(
  intakeText: string | null | undefined,
): LegalPartyAuthorityResult {
  const intake = String(intakeText ?? "").trim();
  const intakeFingerprint = shortIntakeFingerprint(intake);
  const establishedAt = Date.now();
  const roleHints = resolveRoleHintsForIntake(intake);

  let evidence = excludeCoordinator(collectEvidence(intake), intake);
  evidence = dedupeEvidenceRows(evidence);

  let parties: LegalPartyAuthorityRecord[];
  let fallbackCount = 0;

  if (evidence.length >= 2) {
    parties = rowsToAuthorityRecords(evidence, roleHints);
  } else if (evidence.length === 1) {
    parties = rowsToAuthorityRecords(evidence, roleHints);
  } else {
    fallbackCount = 2;
    parties = buildPlaceholderAuthority("no_contracting_parties_extracted");
  }

  if (import.meta.env?.DEV && import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[legal-party-authority-established]", {
      partyCount: parties.length,
      partyIds: parties.map((p) => p.agreementPartyId),
      legalEntityNames: parties.map((p) => p.legalEntityName),
      roles: parties.map((p) => p.agreementRole ?? null),
      confidence: parties.map((p) => p.confidence),
      provenance: parties.map((p) => p.provenance.extractedFrom),
      fallbackCount,
      intakeFingerprint,
    });
  }

  return { parties, intakeFingerprint, fallbackCount, establishedAt };
}

function dedupeEvidenceRows(rows: EvidenceRow[]): EvidenceRow[] {
  const seen = new Set<string>();
  const out: EvidenceRow[] = [];
  for (const row of rows) {
    const key = normalizeEntityKey(row.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return collapseTrusteeDuplicateRows(out);
}

function collapseTrusteeDuplicateRows(rows: EvidenceRow[]): EvidenceRow[] {
  const trusteeRows = rows.filter((r) => /\btrustee\s+of\b/i.test(r.name));
  if (trusteeRows.length === 0) return rows;
  const trustKeys = new Set<string>();
  for (const row of trusteeRows) {
    const trustMatch = row.name.match(/\btrustee\s+of\s+(?:the\s+)?(.+?\btrust\b)/i);
    if (trustMatch?.[1]) trustKeys.add(normalizeEntityKey(trustMatch[1]));
  }
  if (trustKeys.size === 0) return rows;
  return rows.filter((row) => {
    const key = normalizeEntityKey(row.name);
    if (/\btrustee\s+of\b/i.test(row.name)) return true;
    if (!/\btrust\b/i.test(row.name)) return true;
    return !trustKeys.has(key);
  });
}

/** Serializable snapshot for Phase 2 Starter→Paid handoff (no signer or entitlement fields). */
export function serializeLegalPartyAuthoritySnapshot(
  result: LegalPartyAuthorityResult,
): string {
  return JSON.stringify({
    v: 1,
    intakeFingerprint: result.intakeFingerprint,
    establishedAt: result.establishedAt,
    fallbackCount: result.fallbackCount,
    parties: result.parties.map((p) => ({
      agreementPartyId: p.agreementPartyId,
      legalEntityName: p.legalEntityName,
      agreementRole: p.agreementRole,
      commercialRoles: p.commercialRoles,
      sourceMentionIndex: p.sourceMentionIndex,
      canonicalOrder: p.canonicalOrder,
      confidence: p.confidence,
      provenance: p.provenance,
    })),
  });
}

export function projectLegalPartyAuthorityToStarterDraftParties(
  authority: readonly LegalPartyAuthorityRecord[],
): ParsedDraftShape["parties"] {
  return [...authority]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => ({
      id: p.agreementPartyId,
      name: p.legalEntityName,
      role: p.agreementRole?.trim() || "party",
    }));
}

export function readLegalPartyNamesFromAuthority(
  authority: readonly LegalPartyAuthorityRecord[],
): string[] {
  return authority
    .filter((p) => !isPlaceholderPartyName(p.legalEntityName))
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => p.legalEntityName);
}

export function readLegalPartyCountFromAuthority(
  authority: readonly LegalPartyAuthorityRecord[],
): number {
  return readLegalPartyNamesFromAuthority(authority).length;
}

/** Deterministic party-id fingerprint for regression parity (not user-visible). */
export function legalPartyAuthoritySessionKey(generationId: string): string {
  return `claw_legal_party_authority_v1:${generationId}`;
}

export function parseLegalPartyAuthoritySnapshot(raw: string): LegalPartyAuthorityResult | null {
  try {
    const parsed = JSON.parse(raw) as {
      v?: number;
      intakeFingerprint?: string;
      establishedAt?: number;
      fallbackCount?: number;
      parties?: LegalPartyAuthorityRecord[];
    };
    if (parsed?.v !== 1 || !Array.isArray(parsed.parties)) return null;
    return {
      parties: parsed.parties,
      intakeFingerprint: String(parsed.intakeFingerprint ?? ""),
      fallbackCount: parsed.fallbackCount ?? 0,
      establishedAt: parsed.establishedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function authorityIntakeMatches(
  authority: LegalPartyAuthorityResult | null | undefined,
  intakeText: string,
): boolean {
  if (!authority) return false;
  return authority.intakeFingerprint === shortIntakeFingerprint(intakeText);
}

/** Stable hash for party-id collision diagnostics in tests. */
export function fingerprintLegalPartyAuthority(result: LegalPartyAuthorityResult): string {
  return fingerprintAgreementBody(
    result.parties.map((p) => `${p.agreementPartyId}:${p.legalEntityName}`).join("|"),
  );
}
