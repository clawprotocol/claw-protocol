/**
 * Ordered party manifest rows from intake numbered/bullet party lists.
 * Authoritative for legal entity, role, entity type, and address — never from generated corpus.
 */

import { normalizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProSignerMetadataAuthority";
import { extractLegalEntityFromIntakeLine } from "./partySlotIdentityNormalize";

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

const US_CITY_STATE_ZIP_TAIL_RE =
  /,\s*([A-Za-z][A-Za-z\s.'-]{1,48}?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\.?\s*$/;

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

function parseManifestBody(body: string, partyNumber: number): IntakePartyManifestRow | null {
  let rest = String(body ?? "").replace(/\s+/g, " ").trim();
  if (!rest) return null;

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

/** Ordered manifest rows from numbered / bullet party list intake lines. */
export function extractIntakePartyManifestRows(
  intakeRaw: string | null | undefined,
): IntakePartyManifestRow[] {
  const lines = String(intakeRaw ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
  return out.sort((a, b) => a.partyNumber - b.partyNumber);
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
