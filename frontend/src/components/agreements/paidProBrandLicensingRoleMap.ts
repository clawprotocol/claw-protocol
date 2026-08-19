/**
 * Authoritative brand-licensing party role map — intake prose, bullets, and parentheticals.
 * Never infer roles from party slot order when explicit role labels exist.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  parseLabeledPartyBlocks,
  parseQuotedRolePartyLines,
  type LabeledPartyBlock,
} from "./labeledPartyBlockParse";
import { looksLikeStackedPartyLegalEntityLine } from "./starterPartyIdentityIsolation";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";

export type BrandLicensingRoleSlot =
  | "brand_owner"
  | "manufacturer"
  | "master_distributor"
  | "marketing_ecommerce_manager";

export type BrandLicensingRoleMapEntry = {
  fullLegalName: string;
  roleLabel: string;
  slot: BrandLicensingRoleSlot | null;
};

const LEGAL_ENTITY_TAIL_RE =
  /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company)/i;

const PROSE_IS_THE_ROLE_RE =
  /^(.+?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited))\s+is\s+the\s+([A-Za-z&][A-Za-z0-9\s&-]*?)(?:\s+and\s+(?:controls|will|manages|handles|produces)\b|[.,]|$)/i;

const PARENTHEtICAL_ROLE_LINE_RE = new RegExp(
  `^\\s*[*\\-•]?\\s*(.+?${LEGAL_ENTITY_TAIL_RE.source})\\s*\\(([^)]+)\\)\\s*$`,
  "i",
);

const BAD_TERM_PLACEHOLDER_RE =
  /^(?:as\s+stated\s+in\s+the\s+agreement\.?|the\s+term\s+stated\s+in\s+the\s+intake)$/i;

function normRole(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function classifyBrandLicensingRoleSlot(roleLabel: string): BrandLicensingRoleSlot | null {
  const r = normRole(roleLabel).toLowerCase();
  if (!r) return null;
  if (/\bbrand\s+owner\b/.test(r)) return "brand_owner";
  if (/\bmanufactur/.test(r) && !/\bdistribut/.test(r)) return "manufacturer";
  if (/\bmaster\s+distribut/.test(r) || /\bwholesale\s+distribut/.test(r) || /\bdistribut/.test(r)) {
    return "master_distributor";
  }
  if (/marketing/.test(r) || /e-?commerce/.test(r)) return "marketing_ecommerce_manager";
  return null;
}

function pushUniqueEntry(
  entries: BrandLicensingRoleMapEntry[],
  fullLegalName: string,
  roleLabel: string,
): void {
  const name = normRole(fullLegalName);
  const role = normRole(roleLabel);
  if (!name || !role || !isAuthoritativeLegalEntityName(name)) return;
  if (entries.some((e) => partyLegalNamesMatch(e.fullLegalName, name))) return;
  entries.push({
    fullLegalName: name,
    roleLabel: role,
    slot: classifyBrandLicensingRoleSlot(role),
  });
}

/** Parse `* Entity LLC (Role)` and `Entity LLC (Role)` without quotes. */
export function parseParentheticalRolePartyLines(rawIntake: string): Array<{ legalEntity: string; roleLabel: string }> {
  const out: Array<{ legalEntity: string; roleLabel: string }> = [];
  const seen = new Set<string>();
  for (const rawLine of String(rawIntake || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(PARENTHEtICAL_ROLE_LINE_RE);
    if (!match?.[1] || !match?.[2]) continue;
    const legalEntity = normRole(match[1]);
    const roleLabel = normRole(match[2]);
    if (legalEntity.length < 4 || roleLabel.length < 2) continue;
    if (!looksLikeStackedPartyLegalEntityLine(legalEntity)) continue;
    const key = legalEntity.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ legalEntity, roleLabel });
  }
  return out;
}

/** Ordered party names from explicit intake role declarations (prose + bullets + quoted). */
export function resolveBrandLicensingPartyOrderFromIntake(rawIntake: string): string[] {
  const intake = String(rawIntake || "").trim();
  if (!intake) return [];

  const entries: BrandLicensingRoleMapEntry[] = [];
  for (const line of intake.split("\n")) {
    const trimmed = line.trim();
    const prose = trimmed.match(
      /^(.+?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited))\s+is\s+the\s+/i,
    );
    if (prose?.[1]) {
      const name = normRole(prose[1]);
      const roleFromProse = trimmed.match(PROSE_IS_THE_ROLE_RE);
      if (roleFromProse?.[2]) pushUniqueEntry(entries, name, roleFromProse[2]);
      else if (isAuthoritativeLegalEntityName(name)) pushUniqueEntry(entries, name, "Party");
    }
  }
  for (const row of parseParentheticalRolePartyLines(intake)) {
    pushUniqueEntry(entries, row.legalEntity, row.roleLabel);
  }
  for (const row of parseQuotedRolePartyLines(intake)) {
    pushUniqueEntry(entries, row.legalEntity, row.roleLabel);
  }
  return entries.map((e) => e.fullLegalName).filter(isAuthoritativeLegalEntityName);
}

/** Authoritative entity→role map for brand-licensing intakes. */
export function resolveBrandLicensingAuthoritativeRoleMap(
  rawIntake: string,
  draft?: ParsedDraftShape | null,
): BrandLicensingRoleMapEntry[] {
  const intake = String(rawIntake || "").trim();
  if (!intake || !intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) return [];

  const entries: BrandLicensingRoleMapEntry[] = [];
  const labeledBlocks = parseLabeledPartyBlocks(intake);

  for (const line of intake.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(PROSE_IS_THE_ROLE_RE);
    if (!match?.[1] || !match?.[2]) continue;
    pushUniqueEntry(entries, match[1], match[2]);
  }
  for (const row of parseParentheticalRolePartyLines(intake)) {
    pushUniqueEntry(entries, row.legalEntity, row.roleLabel);
  }
  for (const row of parseQuotedRolePartyLines(intake)) {
    pushUniqueEntry(entries, row.legalEntity, row.roleLabel);
  }
  for (const block of labeledBlocks) {
    if (block.legalEntity && block.roleLabel) {
      pushUniqueEntry(entries, block.legalEntity, block.roleLabel);
    }
  }
  for (const party of draft?.parties ?? []) {
    const name = normRole(String(party?.name ?? ""));
    const role = normRole(String(party?.role ?? ""));
    if (!name || !role) continue;
    if (/^(?:party|client|service provider)$/i.test(role)) continue;
    pushUniqueEntry(entries, name, role);
  }

  return entries;
}

export function resolveBrandLicensingRoleLabelForEntity(
  entity: string,
  rawIntake: string,
  draft?: ParsedDraftShape | null,
  labeledBlocks?: readonly LabeledPartyBlock[],
): string | null {
  const map = resolveBrandLicensingAuthoritativeRoleMap(rawIntake, draft);
  const hit = map.find((e) => partyLegalNamesMatch(e.fullLegalName, entity));
  if (hit?.roleLabel) return hit.roleLabel;

  const blocks = labeledBlocks ?? parseLabeledPartyBlocks(rawIntake);
  const block = blocks.find((b) => partyLegalNamesMatch(b.legalEntity, entity));
  if (block?.roleLabel?.trim()) return block.roleLabel.trim();

  return null;
}

export function resolveBrandLicensingEntityForRoleSlot(
  slot: BrandLicensingRoleSlot,
  rawIntake: string,
  draft?: ParsedDraftShape | null,
  partyNames?: readonly string[],
): string | null {
  const map = resolveBrandLicensingAuthoritativeRoleMap(rawIntake, draft);
  const fromMap = map.find((e) => e.slot === slot);
  if (fromMap) return fromMap.fullLegalName;

  const parties = (partyNames ?? map.map((e) => e.fullLegalName)).filter(isAuthoritativeLegalEntityName);

  // Four-party labeled stacks (Licensor / Brand Owner / Manufacturer / Distributor) omit a
  // separate marketing role — align with deterministic recovery (fourth party slot).
  if (slot === "marketing_ecommerce_manager" && parties.length >= 4) {
    if (parties[3]) return parties[3];
    const licensor = map.find((e) => /\blicensor\b/i.test(e.roleLabel));
    if (licensor) return licensor.fullLegalName;
  }

  if (parties.length < 4) return null;

  // Only use index fallback when intake has zero explicit role labels.
  if (map.some((e) => e.slot != null)) return null;

  const indexBySlot: Record<BrandLicensingRoleSlot, number> = {
    brand_owner: 0,
    manufacturer: 1,
    master_distributor: 2,
    marketing_ecommerce_manager: 3,
  };
  return parties[indexBySlot[slot]] ?? null;
}

export function brandLicensingIntakeHasExplicitRoleLabels(rawIntake: string, draft?: ParsedDraftShape | null): boolean {
  return resolveBrandLicensingAuthoritativeRoleMap(rawIntake, draft).some((e) => e.slot != null);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function legalNameMatchVariants(entity: string): string[] {
  const trimmed = normRole(entity);
  const withoutSuffix = trimmed
    .replace(/\s+(LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited)\.?$/i, "")
    .trim();
  const out = [trimmed];
  if (withoutSuffix && withoutSuffix !== trimmed) out.push(withoutSuffix);
  return out;
}

function sectionMentionsEntityNearPhrase(sec1: string, entity: string, phraseRe: RegExp): boolean {
  for (const candidate of legalNameMatchVariants(entity)) {
    const esc = escapeRe(candidate);
    if (new RegExp(`${esc}[^.\\n]{0,220}${phraseRe.source}`, "i").test(sec1)) return true;
    if (new RegExp(`${phraseRe.source}[^.\\n]{0,80}${esc}`, "i").test(sec1)) return true;
  }
  return false;
}
export function sectionSlice(text: string, sectionNum: number): string {
  const body = (text || "").replace(/\r\n/g, "\n");
  const startRe = new RegExp(`(?:^|\\n)\\s*${sectionNum}\\.\\s+[A-Z]`, "im");
  const startMatch = body.match(startRe);
  const start = startMatch?.index != null ? startMatch.index : -1;
  if (start < 0) return "";
  const nextRe = new RegExp(`(?:^|\\n)\\s*${sectionNum + 1}\\.\\s+[A-Z]`, "im");
  const tail = body.slice(start + 1);
  const nextMatch = tail.match(nextRe);
  const end = nextMatch?.index != null ? start + 1 + nextMatch.index : body.length;
  return body.slice(start, end);
}

export type BrandLicensingRoleFidelityResult = {
  ok: boolean;
  defects: string[];
};

/** Compare intake role map to substantive section assignments (sections 1–7). */
export function assessBrandLicensingRoleFidelity(
  text: string,
  rawIntake: string,
  draft?: ParsedDraftShape | null,
): BrandLicensingRoleFidelityResult {
  const intake = String(rawIntake || "").trim();
  if (!intake || !intakeDescribesBrandLicensingDistributionManufacturingStack(intake)) {
    return { ok: true, defects: [] };
  }
  if (!brandLicensingIntakeHasExplicitRoleLabels(intake, draft)) {
    return { ok: true, defects: [] };
  }

  const brandOwner = resolveBrandLicensingEntityForRoleSlot("brand_owner", intake, draft);
  const manufacturer = resolveBrandLicensingEntityForRoleSlot("manufacturer", intake, draft);
  const distributor = resolveBrandLicensingEntityForRoleSlot("master_distributor", intake, draft);
  const marketing = resolveBrandLicensingEntityForRoleSlot("marketing_ecommerce_manager", intake, draft);

  if (!brandOwner || !manufacturer || !distributor || !marketing) {
    return { ok: false, defects: ["role_map_incomplete"] };
  }

  const all = [brandOwner, manufacturer, distributor, marketing];
  const defects: string[] = [];

  const sec1 = sectionSlice(text, 1);
  if (sec1) {
    if (!sectionMentionsEntityNearPhrase(sec1, brandOwner, /\bowns and controls the brand program\b/i)) {
      defects.push("section1_brand_owner_mismatch");
    }
    if (!sectionMentionsEntityNearPhrase(sec1, manufacturer, /\bmanufactures licensed goods\b/i)) {
      defects.push("section1_manufacturer_mismatch");
    }
    if (!sectionMentionsEntityNearPhrase(sec1, distributor, /\bexclusive wholesale distribution\b/i)) {
      defects.push("section1_distributor_mismatch");
    }
    if (!sectionMentionsEntityNearPhrase(sec1, marketing, /\bmarketing campaigns\b/i)) {
      defects.push("section1_marketing_mismatch");
    }
    for (const wrong of all) {
      if (partyLegalNamesMatch(wrong, brandOwner)) continue;
      if (sectionMentionsEntityNearPhrase(sec1, wrong, /\bowns and controls the brand program\b/i)) {
        defects.push("section1_brand_owner_role_swapped");
      }
    }
    for (const wrong of all) {
      if (partyLegalNamesMatch(wrong, manufacturer)) continue;
      if (sectionMentionsEntityNearPhrase(sec1, wrong, /\bmanufactures licensed goods\b/i)) {
        defects.push("section1_manufacturer_role_swapped");
      }
    }
    for (const wrong of all) {
      if (partyLegalNamesMatch(wrong, distributor)) continue;
      if (sectionMentionsEntityNearPhrase(sec1, wrong, /\bexclusive wholesale distribution\b/i)) {
        defects.push("section1_distributor_role_swapped");
      }
    }
    for (const wrong of all) {
      if (partyLegalNamesMatch(wrong, marketing)) continue;
      if (sectionMentionsEntityNearPhrase(sec1, wrong, /\bmarketing campaigns\b/i)) {
        defects.push("section1_marketing_role_swapped");
      }
    }
  }

  const sec2 = sectionSlice(text, 2);
  if (sec2 && !sectionMentionsEntityNearPhrase(sec2, brandOwner, /\bgrants the other Parties\b/i)) {
    defects.push("section2_license_grant_brand_owner_mismatch");
  }

  return { ok: defects.length === 0, defects: [...new Set(defects)] };
}

export function assertBrandLicensingRoleFidelityForFreeze(
  text: string,
  intakeText: string | null | undefined,
  draft?: ParsedDraftShape | null,
): void {
  const result = assessBrandLicensingRoleFidelity(text, String(intakeText || ""), draft ?? null);
  if (!result.ok) {
    throw new Error(`[paid-pro-sot-freeze-blocked] brand_licensing_role_fidelity:${result.defects.join(",")}`);
  }
}

export function sanitizeBrandLicensingTermLine(term: string): string {
  const t = normRole(term);
  if (!t || BAD_TERM_PLACEHOLDER_RE.test(t)) return "three (3) years";
  if (/^\d+\s+years?$/i.test(t)) {
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n) && n > 0) {
      return n === 1 ? "one (1) year" : `${n} (${n}) years`;
    }
  }
  if (/\b(?:twelve|12)\s+months?\b/i.test(t)) return "twelve (12) months";
  if (/\b(?:twenty[-\s]?four|24)\s+months?\b/i.test(t)) return "twenty-four (24) months";
  if (/\bthree\s*\(3\)\s+years?\b/i.test(t) || /\b3\s+years?\b/i.test(t)) return "three (3) years";
  return t;
}
