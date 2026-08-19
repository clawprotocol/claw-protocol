/**
 * Ordered party manifest rows from intake numbered/bullet party lists.
 * Authoritative for legal entity, role, entity type, and address — never from generated corpus.
 */

import { normalizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import { isAuthoritativeLegalEntityName, isPartyMetadataRoleLabel } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProSignerMetadataAuthority";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { extractLegalEntityFromIntakeLine, resolveDeclaredExplicitPartyCount, resolveAuthoritativeIntakePartyNames } from "./partySlotIdentityNormalize";

export type IntakePartyManifestRow = {
  /** 1-based index from numbered intake line. */
  partyNumber: number;
  partyLegalName: string;
  roleLabel: string;
  entityType: string;
  partyAddress: string;
};

const NUMBERED_MANIFEST_LINE_RE = /^\s*(\d+)[.)]\s+(.+)$/;
const BULLET_MANIFEST_LINE_RE = /^\s*[-*•]\s+(.+)$/;
/** Role-colon lines: `Client: Entity LLC, a Delaware corporation located at …` */
const COLON_ROLE_MANIFEST_LINE_RE = /^([A-Za-z][A-Za-z\s/-]{0,80}):\s*(.+)$/;

const US_CITY_STATE_ZIP_TAIL_RE =
  /,\s*([A-Za-z][A-Za-z\s.'-]{1,48}?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\.?\s*$/;

const COLON_MANIFEST_ADDRESS_RE =
  /(?:with its principal office at|located at)\s+(.+?)\.?\s*$/i;

const COLON_MANIFEST_ENTITY_TYPE_RE = /,\s*(a|an)\s+(.+)$/i;

const NON_PARTY_COLON_ROLE_RE =
  /^(?:term|fee|payment|governing|note|include|prepare|total|major|each|confidentiality|dispute|governing law|organization|org|affiliate(?:\s+referral)?|reviewer(?:\s+email)?|notice\s+contact|deliver\s+to|delivery|contacts?)\b/i;

function normalizeManifestEntity(raw: string): string {
  const entity = extractLegalEntityFromIntakeLine(raw);
  if (!entity || !isAuthoritativeLegalEntityName(entity)) return "";
  return entity;
}

function entityPrefixLength(body: string): number {
  const entity = extractLegalEntityFromIntakeLine(body);
  if (!entity) return 0;
  const idx = body.toLowerCase().indexOf(entity.toLowerCase());
  return idx >= 0 ? idx + entity.length : entity.length;
}

function parseColonRoleManifestBody(
  body: string,
  partyNumber: number,
  roleLabel: string,
): IntakePartyManifestRow | null {
  let rest = String(body ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return null;

  let partyAddress = "";
  const addressMatch = rest.match(COLON_MANIFEST_ADDRESS_RE);
  if (addressMatch?.[1]) {
    partyAddress = normalizeCanonicalPartyAddress(addressMatch[1]);
    rest = rest.slice(0, addressMatch.index ?? 0).replace(/,\s*$/, "").trim();
  }

  let entityType = "";
  const typeMatch = rest.match(COLON_MANIFEST_ENTITY_TYPE_RE);
  if (typeMatch?.[2]) {
    entityType = typeMatch[2].trim();
    rest = rest.slice(0, typeMatch.index ?? 0).trim();
  }

  const partyLegalName = normalizeManifestEntity(rest);
  if (!partyLegalName) return null;

  return {
    partyNumber,
    partyLegalName,
    roleLabel: roleLabel.replace(/\s+/g, " ").trim(),
    entityType,
    partyAddress,
  };
}

function parseColonRoleManifestLine(line: string, partyNumber: number): IntakePartyManifestRow | null {
  const m = line.match(COLON_ROLE_MANIFEST_LINE_RE);
  if (!m?.[1] || !m[2]) return null;
  const roleLabel = m[1].trim();
  if (NON_PARTY_COLON_ROLE_RE.test(roleLabel)) return null;
  // TEST537 — per-party metadata field lines ("Address: …", "Signer Title: …", "Email: …")
  // are NOT party manifest rows. Without this, stacked signer-block intake seeds phantom parties
  // from street addresses / job titles and drops the real legal entities entirely.
  if (isPartyMetadataRoleLabel(roleLabel)) return null;
  // "Acme LLC signer: Jane Doe, CEO" / "Acme LLC signer: Jane Doe, Authorized Signatory, a@b.com"
  // is per-entity signer metadata — not a Role: Entity manifest row. Treating the human name as
  // partyLegalName collapses N-party recovery to phantom signer entities and empty handoff slots.
  if (/\bsigner\s*$/i.test(roleLabel)) return null;
  if (NUMBERED_MANIFEST_LINE_RE.test(line) || BULLET_MANIFEST_LINE_RE.test(line)) return null;
  return parseColonRoleManifestBody(m[2], partyNumber, roleLabel);
}

function parseManifestBody(body: string, partyNumber: number): IntakePartyManifestRow | null {
  let rest = String(body ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return null;

  // Party-N bullet metadata (`• Email: …`, `• Representative (human signer): …`) is never a
  // party identity row. Legal-entity field bullets keep only the entity value.
  const fieldLabelMatch = rest.match(
    /^(legal\s+entity(?:\s*\/\s*party\s+name)?|party\s+name|representative(?:\s*\([^)]*\)|\s+name|\s+title)?|represented\s+by|human\s+signer|authorized\s+signer|signer(?:\s+name|\s+title|\s+email)?|physical\s+address|mailing\s+address|party\s+address|address|e-?mail|email|title|name)\s*:\s*(.*)$/i,
  );
  if (fieldLabelMatch) {
    const label = fieldLabelMatch[1]!.trim();
    const value = (fieldLabelMatch[2] || "").trim();
    if (!/^(?:legal\s+entity(?:\s*\/\s*party\s+name)?|party\s+name)$/i.test(label)) {
      return null;
    }
    rest = value;
    if (!rest) return null;
  }

  let roleLabel = "";
  const parenOnly = rest.match(/^(.+?)\s*\(([^)]+)\)\s*\.?\s*$/);
  if (parenOnly && !US_CITY_STATE_ZIP_TAIL_RE.test(rest)) {
    rest = parenOnly[1]!.trim();
    roleLabel = parenOnly[2]!.trim();
  } else {
    const parenBeforeTail = rest.match(/^(.+?)\s*\(([^)]+)\)\s*,\s*(.+)$/);
    if (parenBeforeTail) {
      rest = `${parenBeforeTail[1]!.trim()}, ${parenBeforeTail[3]!.trim()}`;
      roleLabel = parenBeforeTail[2]!.trim();
    }
  }

  const partyLegalName = normalizeManifestEntity(rest);
  if (!partyLegalName) return null;

  let tail = rest.slice(entityPrefixLength(rest)).replace(/^,\s*/, "").trim();
  let entityType = "";
  let partyAddress = "";

  if (tail && US_CITY_STATE_ZIP_TAIL_RE.test(tail)) {
    const zipM = tail.match(US_CITY_STATE_ZIP_TAIL_RE);
    if (zipM?.index != null) {
      const beforeCity = tail.slice(0, zipM.index).replace(/,\s*$/, "");
      const cityStateZip = `${zipM[1]!.trim()}, ${zipM[2]!} ${zipM[3]!}`;
      const segments = beforeCity
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments.length >= 1) {
        const street = segments[segments.length - 1]!;
        entityType = segments.length > 1 ? segments.slice(0, -1).join(", ") : "";
        partyAddress = normalizeCanonicalPartyAddress(`${street}, ${cityStateZip}`);
      } else {
        partyAddress = normalizeCanonicalPartyAddress(cityStateZip);
      }
    }
  } else if (tail && !/\d{5}/.test(tail)) {
    entityType = tail.replace(/\.\s*$/, "").trim();
  }

  return {
    partyNumber,
    partyLegalName,
    roleLabel,
    entityType,
    partyAddress,
  };
}

function parseManifestLine(line: string, fallbackIndex: number): IntakePartyManifestRow | null {
  const numbered = line.match(NUMBERED_MANIFEST_LINE_RE);
  if (numbered?.[1] && numbered[2]) {
    const partyNumber = Number.parseInt(numbered[1], 10);
    return parseManifestBody(
      numbered[2],
      Number.isFinite(partyNumber) && partyNumber >= 1 ? partyNumber : fallbackIndex,
    );
  }
  const bullet = line.match(BULLET_MANIFEST_LINE_RE);
  if (bullet?.[1]) {
    return parseManifestBody(bullet[1], fallbackIndex);
  }
  return null;
}

const ENTITY_ROLE_HEADING_RE = /^(.+?)\s*\(([^)]+)\)\s*\.?\s*$/;
const INLINE_ADDRESS_FIELD_RE = /^(?:address|mailing\s+address|physical\s+address|registered\s+address|principal\s+address)\s*[:\-]\s*(.+)$/i;

/** True when the line is an `Entity (Role)` party heading — not a metadata field parenthetical. */
function entityRoleHeadingRoleLabel(line: string): string | null {
  const m = line.match(ENTITY_ROLE_HEADING_RE);
  if (!m?.[1] || !m[2]) return null;
  const roleLabel = m[2].trim();
  if (isPartyMetadataRoleLabel(roleLabel)) return null;
  if (US_CITY_STATE_ZIP_TAIL_RE.test(line)) return null;
  return roleLabel;
}

/**
 * TEST537 — stacked signer-block intake: each party is a standalone `Entity (Role)` heading line
 * followed by `Address:` / `Authorized Signer:` / `Signer Title:` / `Email:` metadata lines (no
 * number/bullet prefix). Parse the heading as the party and attach its block's Address only.
 */
function extractEntityHeadingManifestRows(lines: readonly string[]): IntakePartyManifestRow[] {
  const rows: IntakePartyManifestRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (NUMBERED_MANIFEST_LINE_RE.test(line) || BULLET_MANIFEST_LINE_RE.test(line)) continue;
    const roleLabel = entityRoleHeadingRoleLabel(line);
    if (roleLabel == null) continue;
    const entityCore = line.match(ENTITY_ROLE_HEADING_RE)![1]!.trim();
    const partyLegalName = normalizeManifestEntity(entityCore);
    if (!partyLegalName) continue;
    if (rows.some((existing) => partyLegalNamesMatch(existing.partyLegalName, partyLegalName))) continue;
    let partyAddress = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (entityRoleHeadingRoleLabel(lines[j]!) != null) break;
      const addrMatch = lines[j]!.match(INLINE_ADDRESS_FIELD_RE);
      if (addrMatch?.[1]) {
        partyAddress = normalizeCanonicalPartyAddress(addrMatch[1].trim());
        break;
      }
    }
    rows.push({
      partyNumber: rows.length + 1,
      partyLegalName,
      roleLabel,
      entityType: "",
      partyAddress,
    });
  }
  return rows;
}

/** Ordered manifest rows from colon-role, entity-heading, numbered, or bullet party list intake lines. */
export function extractIntakePartyManifestRows(
  intakeRaw: string | null | undefined,
): IntakePartyManifestRow[] {
  const lines = String(intakeRaw ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const colonRows: IntakePartyManifestRow[] = [];
  let colonCursor = 1;
  for (const line of lines) {
    const row = parseColonRoleManifestLine(line, colonCursor);
    if (!row) continue;
    if (colonRows.some((existing) => partyLegalNamesMatch(existing.partyLegalName, row.partyLegalName))) {
      continue;
    }
    colonRows.push(row);
    colonCursor += 1;
  }
  if (colonRows.length >= 2) {
    return colonRows.map((row, i) => ({ ...row, partyNumber: i + 1 }));
  }

  const out: IntakePartyManifestRow[] = [];
  let bulletCursor = 1;
  for (const line of lines) {
    const row = parseManifestLine(line, bulletCursor);
    if (!row) continue;
    if (!NUMBERED_MANIFEST_LINE_RE.test(line)) {
      row.partyNumber = bulletCursor;
      bulletCursor += 1;
    }
    if (out.some((existing) => partyLegalNamesMatch(existing.partyLegalName, row.partyLegalName))) {
      continue;
    }
    out.push(row);
  }
  if (out.length >= 2) {
    return out.sort((a, b) => a.partyNumber - b.partyNumber);
  }

  // TEST537 — fall back to standalone `Entity (Role)` heading blocks (stacked signer metadata).
  const headingRows = extractEntityHeadingManifestRows(lines);
  if (headingRows.length >= 2) {
    return headingRows;
  }

  return out.sort((a, b) => a.partyNumber - b.partyNumber);
}

/** True when intake declares an ordered multi-party manifest (colon, numbered, or bullet). */
export function intakePartyManifestIsAuthoritative(intakeRaw: string | null | undefined): boolean {
  const rows = extractIntakePartyManifestRows(intakeRaw);
  if (rows.length < 2) return false;
  const declared = resolveDeclaredExplicitPartyCount(String(intakeRaw ?? ""));
  if (declared != null && declared >= 3) return rows.length >= declared;
  return rows.length >= 2;
}

/** Promote consumed signer authority at freeze when contacts exist or N-party manifest slots are fixed. */
export function shouldPromoteConsumedSignerAuthorityAtFreeze(args: {
  handoffParties: readonly PaidProSignerMetadataParty[];
  intakeRaw: string | null | undefined;
  authoritativeSignerCount?: number;
}): boolean {
  const hasSignerContact = args.handoffParties.some(
    (p) =>
      Boolean(p.signerEmail?.trim()) ||
      Boolean(p.signerName?.trim()) ||
      Boolean(p.signerTitle?.trim()) ||
      Boolean(p.partyAddress?.trim()),
  );
  if (hasSignerContact) return true;
  const signerCount = Math.max(
    args.authoritativeSignerCount ?? 0,
    args.handoffParties.length,
  );
  if (signerCount < 3) return false;
  if (intakePartyManifestIsAuthoritative(args.intakeRaw)) return true;
  const intakeNames = resolveAuthoritativeIntakePartyNames(args.intakeRaw).filter(
    isAuthoritativeLegalEntityName,
  );
  return intakeNames.length >= 3 && intakeNames.length >= signerCount;
}

/** Expand collapsed review handoff to authoritative N-party intake entities at freeze. */
export function expandNPartyHandoffPartiesFromIntakeAuthority(
  intakeRaw: string | null | undefined,
  handoffParties: readonly PaidProSignerMetadataParty[],
  authoritativeSignerCount: number,
): PaidProSignerMetadataParty[] {
  if (authoritativeSignerCount < 3 || handoffParties.length >= authoritativeSignerCount) {
    return [...handoffParties];
  }
  const manifestParties = buildSignerMetadataPartiesFromIntakeManifest(intakeRaw);
  const intakeNames =
    manifestParties.length >= authoritativeSignerCount
      ? manifestParties.map((p) => p.partyLegalName)
      : resolveAuthoritativeIntakePartyNames(intakeRaw).filter(isAuthoritativeLegalEntityName);
  if (intakeNames.length < authoritativeSignerCount) return [...handoffParties];
  return intakeNames.slice(0, authoritativeSignerCount).map((partyLegalName, partyIndex) => {
    const byEntity = handoffParties.find((p) =>
      partyLegalNamesMatch(p.partyLegalName, partyLegalName),
    );
    const byIndex = handoffParties[partyIndex];
    const existing = byEntity ?? byIndex;
    return {
      partyIndex,
      partyLegalName,
      signerEmail: existing?.signerEmail?.trim() || "",
      signerName: existing?.signerName?.trim() || "",
      signerTitle: existing?.signerTitle?.trim() || "",
      partyAddress: existing?.partyAddress?.trim() || "",
    };
  });
}

/** Build signer metadata parties from intake manifest — entity, role, and address only. */
export function buildSignerMetadataPartiesFromIntakeManifest(
  intakeRaw: string | null | undefined,
): PaidProSignerMetadataParty[] {
  return extractIntakePartyManifestRows(intakeRaw).map((row, partyIndex) => ({
    partyIndex,
    partyLegalName: row.partyLegalName,
    signerName: "",
    signerTitle: "",
    signerEmail: "",
    partyAddress: row.partyAddress,
  }));
}

/** Merge intake manifest over corpus-derived review parties after freeze. */
export function overlayIntakeManifestOnReviewParties(
  intakeRaw: string | null | undefined,
  reviewParties: readonly PaidProSignerMetadataParty[],
): PaidProSignerMetadataParty[] {
  const manifestParties = buildSignerMetadataPartiesFromIntakeManifest(intakeRaw);
  if (!intakePartyManifestIsAuthoritative(intakeRaw) || manifestParties.length < 2) {
    return [...reviewParties];
  }
  const manifestEntityKeys = new Set(
    manifestParties.map((p) => p.partyLegalName.trim().toLowerCase()),
  );
  return manifestParties.map((manifest, i) => {
    const byIndex = reviewParties[i];
    const byEntity = reviewParties.find((p) =>
      partyLegalNamesMatch(p.partyLegalName, manifest.partyLegalName),
    );
    const existing = byIndex && manifestEntityKeys.has(byIndex.partyLegalName.trim().toLowerCase())
      ? byIndex
      : byEntity;
    return {
      partyIndex: i,
      partyLegalName: manifest.partyLegalName,
      partyAddress: manifest.partyAddress || existing?.partyAddress || "",
      signerName: existing?.signerName?.trim() || "",
      signerTitle: existing?.signerTitle?.trim() || "",
      signerEmail: existing?.signerEmail?.trim() || "",
    };
  });
}

/** Legal entities in manifest order — preferred authority for multi-party dashboard create. */
export function intakePartyManifestLegalEntities(intakeRaw: string | null | undefined): string[] {
  return extractIntakePartyManifestRows(intakeRaw).map((row) => row.partyLegalName);
}

export function findIntakePartyManifestRowForEntity(
  rows: readonly IntakePartyManifestRow[],
  legalEntity: string,
  slotIndex: number,
): IntakePartyManifestRow | undefined {
  const trimmed = legalEntity.trim();
  if (trimmed) {
    const byName = rows.find((row) => partyLegalNamesMatch(row.partyLegalName, trimmed));
    if (byName) return byName;
  }
  return rows.find((row) => row.partyNumber === slotIndex + 1) ?? rows[slotIndex];
}
