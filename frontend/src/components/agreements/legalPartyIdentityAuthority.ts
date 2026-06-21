/**
 * Legal Party Identity Authority — sole source for creating legal identities.
 *
 * Party *count* is enforced by signerCountAuthority; this module enforces identity
 * continuity: the same legal entities must survive across manifest, signer setup,
 * execution blocks, and user-visible render surfaces.
 *
 * Lower authorities (signer, notice, reviewer, delivery, UI, metadata) may enrich
 * existing slots but may never create, duplicate, or substitute legal identities.
 */

import { textContainsUnresolvedIdentityPlaceholders } from "../../agreement/partyPlaceholderDisplay";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  labeledPartyLegalEntities,
  quotedRolePartyLegalEntities,
} from "./labeledPartyBlockParse";
import {
  collapsePartySlotCandidates,
  normalizeAgreementPartyName,
  repairDraftPartiesFromIntakeAuthority,
  resolveAuthoritativeIntakePartyNames,
  resolveAuthoritativePartySlotCount,
  type DraftPartyRowLike,
} from "./partySlotIdentityNormalize";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { looksLikeEmail } from "./recipientEmailValidation";
import {
  resolveLegalIdentitiesFromExtraction,
  isContaminatedLegalIdentityLabel,
} from "./legalIdentityResolution";

export type AuthoritativeLegalPartyIdentitySource =
  | "labeled_parties"
  | "quoted_roles"
  | "between_clause"
  | "draft_repair";

export type AuthoritativeLegalPartyIdentity = {
  slotIndex: number;
  legalEntityName: string;
  source: AuthoritativeLegalPartyIdentitySource;
};

export type ResolveAuthoritativeLegalPartyIdentitiesArgs = {
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  draftParties?: readonly DraftPartyRowLike[];
  /** Diagnostics / mismatch logging only — never expands authority. */
  consumerPartyCount?: number | null;
  surface?: string;
};

export type LegalIdentityContinuityResult = {
  ok: boolean;
  authorityCount: number;
  consumerCount: number;
  mismatches: Array<{ slotIndex: number; expected: string; actual: string }>;
  duplicates: string[];
};

/** Internal alias tokens that must never appear in user-visible copy. */
export const FORBIDDEN_INTERNAL_ALIAS_RENDER_RE =
  /\bPARTY[_\s-]?[AB]\b(?!\s*(?:LLC|Inc|Corp|Ltd))/i;

/** Contact / signer numbered placeholders that must resolve or be removed. */
export const FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE =
  /\[(?:EMAIL|SIGNER_EMAIL|ADDRESS|PARTY_ADDRESS|SIGNER_NAME|NAME|TITLE|DATE)(?:_\d+)?\]/i;

/** Mustache / template variable leakage. */
export const FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE = /\{\{\s*[^}]+\s*\}\}|\$\{\s*[^}]+\s*\}/;

function resolveIdentitySource(intake: string): AuthoritativeLegalPartyIdentitySource {
  const labeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  if (labeled.length >= 2) return "labeled_parties";
  const quoted = quotedRolePartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  if (quoted.length >= 2) return "quoted_roles";
  return "between_clause";
}

function isNonPartyMetadataToken(name: string): boolean {
  const t = normalizeAgreementPartyName(name);
  if (!t) return true;
  if (looksLikeEmail(t)) return true;
  if (/^(?:reviewer|notice|delivery|archive|billing)@/i.test(t)) return true;
  return false;
}

/**
 * Resolve the ordered legal party identities Legal Party Authority permits for this agreement.
 * This is the only function that may *create* legal identity slots from intake + repaired draft.
 */
export function resolveAuthoritativeLegalPartyIdentities(
  args: ResolveAuthoritativeLegalPartyIdentitiesArgs,
): AuthoritativeLegalPartyIdentity[] {
  const intake = String(args.intakeText ?? "").trim();
  const draftRows: DraftPartyRowLike[] = [
    ...(args.draftParties ?? (args.draftPartyNames ?? []).map((name) => ({ name: String(name ?? "") }))),
  ];
  const resolvedExtraction = resolveLegalIdentitiesFromExtraction({
    candidates: draftRows.map((p) => p.name),
    intakeText: intake,
  });
  const repaired = repairDraftPartiesFromIntakeAuthority(
    resolvedExtraction.length >= 2
      ? resolvedExtraction.map((r, index) => ({
          ...(draftRows[index] ?? { name: r.legalEntityName }),
          name: r.legalEntityName,
        }))
      : draftRows,
    intake,
  );
  let intakeNames = resolveAuthoritativeIntakePartyNames(intake)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2 && isAuthoritativeLegalEntityName(n) && !isNonPartyMetadataToken(n));

  if (intakeNames.length < 2 && resolvedExtraction.length >= 2) {
    intakeNames = resolvedExtraction.map((r) => r.legalEntityName);
  }

  const slotCount = resolveAuthoritativePartySlotCount({
    intakeText: intake,
    draftPartyNames: repaired.map((p) => p.name),
    rawPartyCount: Math.max(repaired.length, intakeNames.length, 2),
  });

  const source = intake.length >= 3 ? resolveIdentitySource(intake) : "draft_repair";
  const collapsedRepaired = collapsePartySlotCandidates(repaired.map((p) => p.name)).filter(
    (n) => isAuthoritativeLegalEntityName(n) && !isNonPartyMetadataToken(n),
  );

  let names: string[] = [];
  if (intakeNames.length >= slotCount) {
    names = intakeNames.slice(0, slotCount);
  } else if (collapsedRepaired.length >= slotCount) {
    names = collapsedRepaired.slice(0, slotCount);
  } else if (intakeNames.length >= 2) {
    names = intakeNames.slice(0, slotCount);
  } else {
    names = collapsedRepaired.slice(0, slotCount);
  }

  while (names.length < slotCount) {
    const fallback = repaired[names.length]?.name ?? "";
    if (fallback && isAuthoritativeLegalEntityName(fallback) && !isNonPartyMetadataToken(fallback)) {
      names.push(normalizeAgreementPartyName(fallback));
    } else {
      break;
    }
  }

  return names.slice(0, slotCount).map((legalEntityName, slotIndex) => ({
    slotIndex,
    legalEntityName,
    source: intakeNames.length >= 2 ? source : "draft_repair",
  }));
}

/** Lower-authority consumer names must match authority — count alone is insufficient. */
export function compareLegalIdentityContinuity(
  authority: readonly AuthoritativeLegalPartyIdentity[],
  consumerNames: readonly string[],
): LegalIdentityContinuityResult {
  const expected = authority.map((a) => a.legalEntityName);
  const actual = consumerNames.map((n) => normalizeAgreementPartyName(String(n ?? ""))).filter(Boolean);
  const authorityCount = expected.length;
  const consumerCount = actual.length;
  const mismatches: LegalIdentityContinuityResult["mismatches"] = [];
  const limit = Math.max(authorityCount, consumerCount);
  for (let i = 0; i < limit; i++) {
    const exp = expected[i] ?? "";
    const got = actual[i] ?? "";
    if (!exp || !got) {
      if (exp !== got) mismatches.push({ slotIndex: i, expected: exp, actual: got });
      continue;
    }
    if (!partyLegalNamesMatch(exp, got)) {
      mismatches.push({ slotIndex: i, expected: exp, actual: got });
      continue;
    }
    if (isContaminatedLegalIdentityLabel(got, exp)) {
      mismatches.push({ slotIndex: i, expected: exp, actual: got });
    }
  }
  const duplicates = detectDuplicateLegalIdentities(expected).duplicates;
  return {
    ok: mismatches.length === 0 && duplicates.length === 0 && authorityCount === consumerCount,
    authorityCount,
    consumerCount,
    mismatches,
    duplicates,
  };
}

export function detectDuplicateLegalIdentities(names: readonly string[]): {
  duplicate: boolean;
  duplicates: string[];
} {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const raw of names) {
    const name = normalizeAgreementPartyName(String(raw ?? ""));
    if (!name || !isAuthoritativeLegalEntityName(name)) continue;
    const key = name.toLowerCase();
    for (const [prevKey, prevName] of seen) {
      if (partyLegalNamesMatch(prevName, name) || prevKey === key) {
        duplicates.push(name);
        break;
      }
    }
    seen.set(key, name);
  }
  return { duplicate: duplicates.length > 0, duplicates };
}

/**
 * Slice consumer identity rows to authority — returns authority legal names only.
 * Use when a surface has inflated or corrupted party rows.
 */
export function sliceLegalNamesToAuthority(
  authority: readonly AuthoritativeLegalPartyIdentity[],
  _consumerNames?: readonly string[],
): string[] {
  return authority.map((a) => a.legalEntityName);
}

export function resolveAuthoritativeLegalPartyCount(
  args: ResolveAuthoritativeLegalPartyIdentitiesArgs,
): number {
  const identities = resolveAuthoritativeLegalPartyIdentities(args);
  if (identities.length >= 2) return identities.length;
  return consumeAuthoritativeSignerCount(
    args.surface ?? "legal_party_identity_count",
    {
      intakeText: args.intakeText,
      draftPartyNames: args.draftPartyNames,
      draftParties: args.draftParties,
      rawPartyCount: args.draftParties?.length ?? args.draftPartyNames?.length ?? 2,
      userExpandedPartyCount: args.consumerPartyCount ?? 0,
    },
    args.consumerPartyCount ?? identities.length,
  );
}

export function containsForbiddenIdentityRenderTokens(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  if (textContainsUnresolvedIdentityPlaceholders(t)) return true;
  FORBIDDEN_INTERNAL_ALIAS_RENDER_RE.lastIndex = 0;
  if (FORBIDDEN_INTERNAL_ALIAS_RENDER_RE.test(t)) return true;
  FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE.lastIndex = 0;
  if (FORBIDDEN_CONTACT_PLACEHOLDER_RENDER_RE.test(t)) return true;
  FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE.lastIndex = 0;
  return FORBIDDEN_TEMPLATE_VARIABLE_RENDER_RE.test(t);
}

export function assertUserVisibleRenderIntegrity(
  text: string,
  surface = "user_visible",
): { ok: boolean; reason: string | null } {
  if (containsForbiddenIdentityRenderTokens(text)) {
    return { ok: false, reason: `${surface}:forbidden_identity_or_placeholder_token` };
  }
  return { ok: true, reason: null };
}
