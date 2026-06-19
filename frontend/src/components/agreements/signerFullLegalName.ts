/**
 * Signer / execution surfaces must show full legal entity names, not defined-term aliases.
 */

import type { ExtractAgreementPartiesInput } from "../../agreement/extractAgreementParties";
import { finalizePartyDisplayNameForUserFacing } from "../../agreement/partyNameDisplayCasing";
import {
  resolveFullLegalPartiesFromIntake,
} from "./paidProPartyNamePreserve";

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function shortTokenFromFullName(full: string): string {
  const first = full.trim().split(/\s+/)[0] || "";
  return first.replace(/[^A-Za-z0-9]/g, "");
}

function partyNamesMatch(shortOrPartial: string, fullLegal: string): boolean {
  const a = normalizeKey(shortOrPartial);
  const b = normalizeKey(fullLegal);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.includes(a) && a.length >= 4) return true;
  const tok = shortTokenFromFullName(fullLegal).toLowerCase();
  if (tok.length >= 4 && a.includes(tok)) return true;
  return false;
}

function resolveFullLegalForSlot(
  slotName: string,
  authoritative: readonly string[],
  intakeText: string | null | undefined,
): string {
  const trimmed = (slotName || "").trim();
  if (!trimmed) return trimmed;
  const hit = authoritative.find((full) => partyNamesMatch(trimmed, full));
  if (hit) return finalizePartyDisplayNameForUserFacing(hit, intakeText ?? null);
  if (/\b(?:LLC|Inc\.?|Corp\.?|Ltd\.?|LP|LLP)\b/i.test(trimmed)) {
    return finalizePartyDisplayNameForUserFacing(trimmed, intakeText ?? null);
  }
  const intakeHit = authoritative.find((full) => normalizeKey(full) === normalizeKey(trimmed));
  if (intakeHit) return finalizePartyDisplayNameForUserFacing(intakeHit, intakeText ?? null);
  return finalizePartyDisplayNameForUserFacing(trimmed, intakeText ?? null);
}

/**
 * Party labels for LawDog signer cards and premium readonly HTML — always prefer intake full legal names.
 */
export function resolveSignerCardPartyNames(input: ExtractAgreementPartiesInput): string[] {
  const intake = (input.intakeText || "").trim();
  const draftNames = (input.parties || [])
    .map((p) => String(p.name || "").trim())
    .filter((n) => n.length > 0);
  const fromRendered = extractPartyNamesFromRenderedOrder(input.renderedText || "");
  const orderedSlots = draftNames.length > 0 ? draftNames : fromRendered;
  /** Intake "between …" list is authoritative for full legal names — not draft short aliases. */
  const authoritative = resolveFullLegalPartiesFromIntake(null, intake);
  if (authoritative.length >= 2) {
    return authoritative.slice(0, 2).map((n) => finalizePartyDisplayNameForUserFacing(n, intake));
  }
  return orderedSlots.map((n) => resolveFullLegalForSlot(n, authoritative, intake));
}

function extractPartyNamesFromRenderedOrder(rendered: string): string[] {
  const t = (rendered || "").trim();
  if (!t) return [];
  const between = t.match(/\b(?:among|between)\s+([^.;]+?)(?:\.|;|\s+for\s+|\s+to\s+)/i);
  if (!between) return [];
  return between[1]
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

/** True when `name` is only a short alias while a longer legal form exists in authoritative list. */
export function isShortPartyAliasOnly(name: string, authoritative: readonly string[]): boolean {
  const n = (name || "").trim();
  if (!n || /\b(?:LLC|Inc\.?|Corp\.?|Ltd\.?|LP|LLP)\b/i.test(n)) return false;
  return authoritative.some((full) => full.length > n.length + 8 && partyNamesMatch(n, full));
}
