/**
 * Prepare / packet placement: hard requirements vs optional field suggestions.
 * Only signature is universally required per signer unless a template explicitly adds keys.
 */

export const VS01_DEFAULT_REQUIRED_KEYS = ["signature"] as const;
export type Vs01HardRequiredFieldKey = (typeof VS01_DEFAULT_REQUIRED_KEYS)[number];

export const VS01_OPTIONAL_SUGGESTED_FIELD_KEYS = [
  "printed_name",
  "title",
  "date",
  "email",
  "initials",
] as const;

export type Vs01SignerFieldTallies = {
  signature: number;
  printed_name: number;
  date: number;
  title: number;
};

export type Vs01PrepareSigningRoleLike = {
  roleId: string;
  requiresSignature: boolean;
  entityName?: string | null;
  partyName?: string | null;
};

export type ResolveVs01RequiredSignerFieldsInput = {
  roles: Vs01PrepareSigningRoleLike[];
  fieldsByRole: Record<string, Vs01SignerFieldTallies>;
  /** Explicit template/document markers only — never inferred from entity name. */
  templateRequiredKeysByRole?: Record<string, readonly string[]>;
};

export type Vs01MissingSignatureRole = {
  roleId: string;
  displayName: string;
};

export type ResolveVs01RequiredSignerFieldsResult = {
  canContinue: boolean;
  missingSignatureRoles: Vs01MissingSignatureRole[];
  optionalSuggestedFieldsByRole: Record<string, string[]>;
  requiredKeys: readonly string[];
  missingByParty: Record<string, string[]>;
};

export function roleDisplayNameForPrepare(role: Vs01PrepareSigningRoleLike): string {
  return role.entityName?.trim() || role.partyName?.trim() || "Signer";
}

/** Hard missing keys for one signer (signature + optional template-required keys). */
export function missingHardKeysForRole(
  tallies: Vs01SignerFieldTallies,
  templateRequiredKeys: readonly string[] = [],
): string[] {
  const missing: string[] = [];
  if (tallies.signature < 1) missing.push("signature");
  for (const key of templateRequiredKeys) {
    if (key === "printed_name" && tallies.printed_name < 1) missing.push("printed_name");
    else if (key === "date" && tallies.date < 1) missing.push("date");
    else if (key === "title" && tallies.title < 1) missing.push("title");
    else if (key === "email") {
      /* email tally not tracked on prepare gate — template-only hook for future */
    } else if (key === "initials") {
      /* initials never satisfy signature; not counted in tallies for gate */
    }
  }
  return missing;
}

/** Optional enhancements — never block Continue. */
export function optionalSuggestedKeysForRole(tallies: Vs01SignerFieldTallies): string[] {
  const out: string[] = [];
  if (tallies.printed_name < 1) out.push("printed_name");
  if (tallies.title < 1) out.push("title");
  if (tallies.date < 1) out.push("date");
  return out;
}

export function resolveVs01RequiredSignerFields(
  input: ResolveVs01RequiredSignerFieldsInput,
): ResolveVs01RequiredSignerFieldsResult {
  const missingByParty: Record<string, string[]> = {};
  const optionalSuggestedFieldsByRole: Record<string, string[]> = {};
  const missingSignatureRoles: Vs01MissingSignatureRole[] = [];

  for (const role of input.roles) {
    if (!role.requiresSignature) continue;
    const tallies = input.fieldsByRole[role.roleId] ?? {
      signature: 0,
      printed_name: 0,
      date: 0,
      title: 0,
    };
    const templateKeys = input.templateRequiredKeysByRole?.[role.roleId] ?? [];
    const miss = missingHardKeysForRole(tallies, templateKeys);
    if (miss.length) missingByParty[role.roleId] = miss;
    if (miss.includes("signature")) {
      missingSignatureRoles.push({
        roleId: role.roleId,
        displayName: roleDisplayNameForPrepare(role),
      });
    }
    const optional = optionalSuggestedKeysForRole(tallies);
    if (optional.length) optionalSuggestedFieldsByRole[role.roleId] = optional;
  }

  return {
    canContinue: Object.keys(missingByParty).length === 0,
    missingSignatureRoles,
    optionalSuggestedFieldsByRole,
    requiredKeys: [...VS01_DEFAULT_REQUIRED_KEYS],
    missingByParty,
  };
}
