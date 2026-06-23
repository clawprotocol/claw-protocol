/**
 * Canonical intake signer metadata authority — legal entity, signer name/title, email, address.
 * Aligns by canonical legal entity first, then labeled Party N / ordered slot fallback.
 * Never treats human signer names as legal entities.
 */

import { normalizeSignerMetadataForSave } from "../../agreement/signerMetadataNormalize";
import { parseLabeledPartyBlocks, type LabeledPartyBlock } from "./labeledPartyBlockParse";
import {
  sanitizePartyLegalNameFromIntakeFragment,
} from "./intakeSignerInstructionParse";
import { entitiesMatchForSignerMetadata } from "./universalSignerMetadataAuthority";
import { looksLikeEmail, stripRecipientEmailNoise } from "./recipientEmailValidation";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

export type IntakeSignerMetadataSource =
  | "labeled_party_block"
  | "entity_signer_clause"
  | "signer_for_entity_is"
  | "party_n_signer"
  | "for_role_signer"
  | "signed_by"
  | "intake_contact";

export type ExtractedIntakeSignerMetadata = {
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  partyAddress: string;
  /** 1-based Party N when parsed from "Party N signer…". */
  partyNumber?: number;
  source: IntakeSignerMetadataSource;
};

export type CanonicalIntakeSignerSlot = {
  partyIndex: number;
  partyLegalName: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  partyAddress: string;
};

const ENTITY_SUFFIX_PATTERN =
  "(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLP|PLLC|LP|L\\.P\\.|Co\\.?|Company)\\.?";

const ENTITY_CAPTURE =
  `(?:[A-Z][A-Za-z0-9\\s&'.-]{0,96}${ENTITY_SUFFIX_PATTERN})`;

const SIGNER_FOR_ENTITY_IS_FULL_RE =
  /\bSigner\s+for\s+(.+?)\s+is\s+(.+?)(?=\.\s+\bSigner\s+for\b|\.\s*$|\s*$)/gi;

/** "Party 1 signer is Joe Doe, CEO" */
const PARTY_N_SIGNER_IS_RE =
  /\bParty\s+(\d+)\s+signer\s+is\s+([^,\n]+?)(?:,\s*([^.\n]+?))?(?:\.|$)/gi;

/** "For Client: Sarah Mitchell, CEO, sarah@example.com" */
const FOR_ROLE_SIGNER_RE =
  /\bFor\s+(Client|Service\s+Provider|Vendor|Contractor|Consultant|Party\s+\d+)\s*:\s*([^.\n]+?)(?:\.|$)/gi;

/** "Signed by Joe Doe, CEO" — slot order only. */
const SIGNED_BY_RE = /\bSigned\s+by\s+([^,\n]+?)(?:,\s*([^.\n]+?))?(?:\.|$)/gi;

function cleanSignerField(value: string | null | undefined, field: "signerName" | "signerTitle"): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return normalizeSignerMetadataForSave(raw, field) ?? "";
}

function cleanEmail(value: string | null | undefined): string {
  const raw = stripRecipientEmailNoise(String(value ?? "").trim());
  return looksLikeEmail(raw) ? raw : "";
}

function cleanAddress(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isLegalEntityName(value: string): boolean {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length < 4) return false;
  if (isAuthoritativeLegalEntityName(t)) return true;
  return new RegExp(`${ENTITY_SUFFIX_PATTERN}$`, "i").test(t);
}

function isStrictLegalEntityName(value: string): boolean {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length < 4 || t.length > 72) return false;
  if (/^\d/.test(t) || /\b\d{5}\b/.test(t)) return false;
  if (/^(?:and|for|the|of|permitted|notices|signatures|amendments)\b/i.test(t)) return false;
  return isLegalEntityName(t);
}

function normalizeExtractedLegalEntity(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  const tail = compact.match(
    new RegExp(`([A-Z][A-Za-z0-9\\s&'.-]{0,96}${ENTITY_SUFFIX_PATTERN})$`, "i"),
  )?.[1];
  const entity = tail
    ? sanitizePartyLegalNameFromIntakeFragment(tail)
    : sanitizePartyLegalNameFromIntakeFragment(compact);
  return isStrictLegalEntityName(entity) ? entity : "";
}

function legalEntityImmediatelyBeforeIndex(text: string, maxLookback = 160): string {
  const slice = text.slice(Math.max(0, text.length - maxLookback));
  const lineStart = slice.lastIndexOf("\n");
  const local = (lineStart >= 0 ? slice.slice(lineStart + 1) : slice).trim();
  const entityRe = new RegExp(ENTITY_CAPTURE, "gi");
  const matches = [...local.matchAll(entityRe)];
  if (matches.length === 0) return "";
  return normalizeExtractedLegalEntity(matches[matches.length - 1]![0] ?? "");
}

/** Scan for `Entity LLC signer:` blocks without backtracking into prior prose. */
function extractEntitySignerColonClauses(raw: string): ExtractedIntakeSignerMetadata[] {
  const out: ExtractedIntakeSignerMetadata[] = [];
  const markerRe = /\s+signer\s*:/gi;
  const heads: { entity: string; tailStart: number; markerStart: number }[] = [];

  for (const m of raw.matchAll(markerRe)) {
    const markerStart = m.index ?? 0;
    const before = raw.slice(0, markerStart);
    const bestEntity = legalEntityImmediatelyBeforeIndex(before);
    if (!bestEntity) continue;
    heads.push({
      entity: bestEntity,
      tailStart: markerStart + m[0].length,
      markerStart,
    });
  }

  for (let i = 0; i < heads.length; i++) {
    const start = heads[i]!.tailStart;
    const end = i + 1 < heads.length ? heads[i + 1]!.markerStart : raw.length;
    const tailRaw = raw.slice(start, end).trim().replace(/\.\s*$/, "");
    const parsed = parseCommaSeparatedSignerTail(tailRaw);
    pushExtracted(out, {
      legalEntity: heads[i]!.entity,
      ...parsed,
      source: "entity_signer_clause",
    });
  }
  return out;
}

function parseCommaSeparatedSignerTail(tail: string): {
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  partyAddress: string;
} {
  const parts = tail
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { signerName: "", signerTitle: "", signerEmail: "", partyAddress: "" };
  }
  let signerName = cleanSignerField(parts[0], "signerName");
  let signerTitle = "";
  let signerEmail = "";
  let partyAddress = "";
  const rest = parts.slice(1);
  const emailIdx = rest.findIndex((p) => looksLikeEmail(stripRecipientEmailNoise(p)));
  if (emailIdx >= 0) {
    signerEmail = cleanEmail(rest[emailIdx]);
    if (emailIdx === 0 && rest.length > 0) {
      signerTitle = cleanSignerField(rest[0], "signerTitle");
      partyAddress = cleanAddress(rest.slice(emailIdx + 1).join(", "));
    } else {
      signerTitle = cleanSignerField(rest.slice(0, emailIdx).join(", "), "signerTitle");
      partyAddress = cleanAddress(rest.slice(emailIdx + 1).join(", "));
    }
  } else if (rest.length === 1) {
    signerTitle = cleanSignerField(rest[0], "signerTitle");
  } else if (rest.length >= 2) {
    signerTitle = cleanSignerField(rest[0], "signerTitle");
    partyAddress = cleanAddress(rest.slice(1).join(", "));
  }
  if (!signerName && parts.length === 1 && looksLikeEmail(parts[0]!)) {
    signerName = "";
    signerEmail = cleanEmail(parts[0]);
  }
  return { signerName, signerTitle, signerEmail, partyAddress };
}

function fromLabeledBlock(block: LabeledPartyBlock): ExtractedIntakeSignerMetadata {
  return {
    legalEntity: block.legalEntity,
    signerName: cleanSignerField(block.signerName, "signerName"),
    signerTitle: cleanSignerField(block.signerTitle, "signerTitle"),
    signerEmail: cleanEmail(block.signerEmail),
    partyAddress: cleanAddress(block.address),
    partyNumber: block.index,
    source: "labeled_party_block",
  };
}

function pushExtracted(
  out: ExtractedIntakeSignerMetadata[],
  row: ExtractedIntakeSignerMetadata,
): void {
  if (
    !row.signerName &&
    !row.signerTitle &&
    !row.signerEmail &&
    !row.partyAddress &&
    !row.legalEntity
  ) {
    return;
  }
  out.push(row);
}

/** Extract all signer metadata rows from intake text (multiple phrasings). */
export function extractCanonicalIntakeSignerMetadata(
  intakeRaw: string | null | undefined,
): ExtractedIntakeSignerMetadata[] {
  const raw = String(intakeRaw || "");
  if (!raw.trim()) return [];
  const out: ExtractedIntakeSignerMetadata[] = [];

  for (const block of parseLabeledPartyBlocks(raw)) {
    pushExtracted(out, fromLabeledBlock(block));
  }

  SIGNER_FOR_ENTITY_IS_FULL_RE.lastIndex = 0;
  for (const m of raw.matchAll(SIGNER_FOR_ENTITY_IS_FULL_RE)) {
    const entity = sanitizePartyLegalNameFromIntakeFragment((m[1] ?? "").trim());
    const parsed = parseCommaSeparatedSignerTail((m[2] ?? "").trim());
    pushExtracted(out, {
      legalEntity: entity,
      ...parsed,
      source: "signer_for_entity_is",
    });
  }

  for (const row of extractEntitySignerColonClauses(raw)) {
    pushExtracted(out, row);
  }

  PARTY_N_SIGNER_IS_RE.lastIndex = 0;
  for (const m of raw.matchAll(PARTY_N_SIGNER_IS_RE)) {
    const partyNumber = Number.parseInt(m[1] ?? "", 10);
    pushExtracted(out, {
      legalEntity: "",
      signerName: cleanSignerField(m[2], "signerName"),
      signerTitle: cleanSignerField(m[3], "signerTitle"),
      signerEmail: "",
      partyAddress: "",
      partyNumber: Number.isFinite(partyNumber) ? partyNumber : undefined,
      source: "party_n_signer",
    });
  }

  FOR_ROLE_SIGNER_RE.lastIndex = 0;
  for (const m of raw.matchAll(FOR_ROLE_SIGNER_RE)) {
    const role = (m[1] ?? "").trim();
    const parsed = parseCommaSeparatedSignerTail((m[2] ?? "").trim());
    let partyNumber: number | undefined;
    const roleLower = role.toLowerCase();
    if (roleLower === "client") partyNumber = 1;
    else if (roleLower.includes("service") && roleLower.includes("provider")) partyNumber = 2;
    else {
      const partyM = role.match(/^party\s+(\d+)$/i);
      if (partyM?.[1]) partyNumber = Number.parseInt(partyM[1], 10);
    }
    pushExtracted(out, {
      legalEntity: "",
      ...parsed,
      partyNumber,
      source: "for_role_signer",
    });
  }

  SIGNED_BY_RE.lastIndex = 0;
  for (const m of raw.matchAll(SIGNED_BY_RE)) {
    pushExtracted(out, {
      legalEntity: "",
      signerName: cleanSignerField(m[1], "signerName"),
      signerTitle: cleanSignerField(m[2], "signerTitle"),
      signerEmail: "",
      partyAddress: "",
      source: "signed_by",
    });
  }

  return out;
}

function mergeNonEmptyFields(
  target: CanonicalIntakeSignerSlot,
  source: ExtractedIntakeSignerMetadata,
): void {
  if (source.signerName && !target.signerName) target.signerName = source.signerName;
  if (source.signerTitle && !target.signerTitle) target.signerTitle = source.signerTitle;
  if (source.signerEmail && !target.signerEmail) target.signerEmail = source.signerEmail;
  if (source.partyAddress && !target.partyAddress) target.partyAddress = source.partyAddress;
}

/**
 * Align extracted intake metadata to authoritative legal entities (entity match first, slot fallback).
 * Preserves known legal entities — never overwrites with signer names.
 */
export function alignIntakeSignerMetadataToLegalEntities(
  intakeRaw: string | null | undefined,
  legalEntities: readonly string[],
): CanonicalIntakeSignerSlot[] {
  const canonicalEntities = legalEntities
    .map((e) => sanitizePartyLegalNameFromIntakeFragment(e.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
  const partyCount = Math.max(canonicalEntities.length, 2);
  const slots: CanonicalIntakeSignerSlot[] = [];
  for (let i = 0; i < partyCount; i++) {
    slots.push({
      partyIndex: i,
      partyLegalName: canonicalEntities[i] ?? "",
      signerName: "",
      signerTitle: "",
      signerEmail: "",
      partyAddress: "",
    });
  }

  const extracted = extractCanonicalIntakeSignerMetadata(intakeRaw);
  const unmatched: ExtractedIntakeSignerMetadata[] = [];

  for (const row of extracted) {
    const entity = normalizeExtractedLegalEntity(row.legalEntity.trim());
    if (entity && isStrictLegalEntityName(entity)) {
      let matched = false;
      for (let i = 0; i < slots.length; i++) {
        const slotEntity = slots[i]!.partyLegalName;
        if (slotEntity && entitiesMatchForSignerMetadata(slotEntity, entity)) {
          mergeNonEmptyFields(slots[i]!, row);
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i]!.partyLegalName) {
            slots[i]!.partyLegalName = entity;
            mergeNonEmptyFields(slots[i]!, row);
            matched = true;
            break;
          }
        }
      }
      if (!matched) unmatched.push(row);
      continue;
    }
    unmatched.push(row);
  }

  for (const row of unmatched) {
    if (row.partyNumber != null && row.partyNumber >= 1) {
      const idx = row.partyNumber - 1;
      if (idx >= 0 && idx < slots.length) {
        mergeNonEmptyFields(slots[idx]!, row);
      }
    }
  }

  const indexOnly = unmatched.filter(
    (r) => !r.legalEntity && !r.partyNumber && (r.signerName || r.signerEmail || r.partyAddress),
  );
  let cursor = 0;
  for (const row of indexOnly) {
    while (cursor < slots.length && slots[cursor]!.signerName) cursor += 1;
    if (cursor >= slots.length) break;
    mergeNonEmptyFields(slots[cursor]!, row);
    cursor += 1;
  }

  return slots;
}

function partiesFromLabeledBlocks(intakeRaw: string | null | undefined): PaidProSignerMetadataParty[] {
  return parseLabeledPartyBlocks(String(intakeRaw || "")).map((block, partyIndex) => ({
    partyIndex,
    partyLegalName: block.legalEntity,
    signerEmail: block.signerEmail,
    signerTitle: block.signerTitle,
    signerName: block.signerName,
    partyAddress: block.address,
  }));
}

export function authorityPartiesFromIntakeSignerMetadata(
  intakeRaw: string | null | undefined,
  legalEntities: readonly string[],
): PaidProSignerMetadataParty[] {
  const labeled = partiesFromLabeledBlocks(intakeRaw);
  if (labeled.length >= 2 && legalEntities.length === 0) {
    return labeled;
  }
  if (labeled.length >= legalEntities.length && legalEntities.length >= 2) {
    return mergeIntakeSignerMetadataIntoAuthorityParties(labeled, intakeRaw, legalEntities);
  }
  return alignIntakeSignerMetadataToLegalEntities(intakeRaw, legalEntities).map((slot) => ({
    partyIndex: slot.partyIndex,
    partyLegalName: slot.partyLegalName,
    signerEmail: slot.signerEmail,
    signerName: slot.signerName,
    signerTitle: slot.signerTitle,
    partyAddress: slot.partyAddress,
  }));
}

/** Merge intake authority into existing parties — fills empty fields only. */
export function mergeIntakeSignerMetadataIntoAuthorityParties(
  parties: readonly PaidProSignerMetadataParty[],
  intakeRaw: string | null | undefined,
  legalEntities: readonly string[],
): PaidProSignerMetadataParty[] {
  const aligned = alignIntakeSignerMetadataToLegalEntities(intakeRaw, legalEntities);
  const count = Math.max(parties.length, aligned.length, 2);
  const out: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < count; i++) {
    const cur = parties[i];
    const intake = aligned[i];
    const legal =
      (cur?.partyLegalName.trim() && isLegalEntityName(cur.partyLegalName)
        ? cur.partyLegalName
        : "") ||
      intake?.partyLegalName ||
      legalEntities[i]?.trim() ||
      "";
    out.push({
      partyIndex: i,
      partyLegalName: legal,
      signerEmail: cur?.signerEmail.trim() || intake?.signerEmail || "",
      signerName: cur?.signerName.trim() || intake?.signerName || "",
      signerTitle: cur?.signerTitle.trim() || intake?.signerTitle || "",
      partyAddress: cur?.partyAddress.trim() || intake?.partyAddress || "",
    });
  }
  return out;
}

export function countIntakeSignerMetadataSlots(
  intakeRaw: string | null | undefined,
  legalEntities: readonly string[],
): {
  partySlotCount: number;
  slotsWithSignerName: number;
  slotsWithSignerTitle: number;
  slotsWithEmail: number;
  slotsWithAddress: number;
} {
  const aligned = alignIntakeSignerMetadataToLegalEntities(intakeRaw, legalEntities);
  return {
    partySlotCount: aligned.length,
    slotsWithSignerName: aligned.filter((s) => s.signerName.trim()).length,
    slotsWithSignerTitle: aligned.filter((s) => s.signerTitle.trim()).length,
    slotsWithEmail: aligned.filter((s) => s.signerEmail.trim()).length,
    slotsWithAddress: aligned.filter((s) => s.partyAddress.trim()).length,
  };
}
