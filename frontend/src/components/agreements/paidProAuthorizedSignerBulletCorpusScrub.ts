/**
 * Remove authorized-signers bullet pollution from agreement corpus party labels.
 */

import {
  looksLikeAuthorizedSignersBulletLine,
  parseAuthorizedSignersBulletLine,
} from "./intakeSignerMetadataAuthority";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";
import { resolveIntakeBetweenClauseLegalEntities } from "./paidProProfessionalClauseCoverage";

const BULLET_PARTY_LINE_RE =
  /(?:^|[\n*]\s*)\*?\s*([A-Z][^,\n*]+?),\s*([^,\n]+?),\s*((?:[A-Za-z0-9][A-Za-z0-9\s&'.-]*?)(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.|Co\.?|Company)\.?)/gi;

export function scrubAuthorizedSignerBulletPartyLabelsFromCorpus(
  text: string,
  intakeRaw?: string | null,
  partyNames?: readonly string[],
): string {
  const raw = (text || "").trim();
  if (!raw) return raw;
  const authoritative = resolveIntakeBetweenClauseLegalEntities(intakeRaw);
  const fullNames =
    authoritative.length >= 2
      ? authoritative
      : resolveFullLegalPartiesFromIntake(partyNames, intakeRaw);
  if (fullNames.length < 2) return raw;

  let out = raw;
  BULLET_PARTY_LINE_RE.lastIndex = 0;
  for (const m of raw.matchAll(BULLET_PARTY_LINE_RE)) {
    const fullMatch = m[0] ?? "";
    const parsed = parseAuthorizedSignersBulletLine(fullMatch.replace(/^\s*[\n*]+/, "").trim());
    const entity = parsed?.legalEntity?.trim() ?? "";
    if (!entity) continue;
    const target = fullNames.find((f) => partyLegalNamesMatch(f, entity));
    if (!target) continue;
    out = out.split(fullMatch).join(target);
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!looksLikeAuthorizedSignersBulletLine(trimmed)) continue;
    const parsed = parseAuthorizedSignersBulletLine(trimmed);
    const entity = parsed?.legalEntity?.trim();
    if (!entity) continue;
    const target = fullNames.find((f) => partyLegalNamesMatch(f, entity));
    if (target && out.includes(trimmed)) {
      out = out.split(trimmed).join(target);
    }
  }
  return out;
}
